-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'sender', 'receiver');
CREATE TYPE notif_status AS ENUM ('sent', 'delivered', 'acknowledged');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'Unassigned',
  role user_role NOT NULL DEFAULT 'receiver',
  avatar_url TEXT,
  is_online BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE group_members (
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  status notif_status NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX ON notifications (recipient_id, created_at DESC);

-- Auto-create a profile when an auth user is created
CREATE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, department)
  VALUES (NEW.id, NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
          COALESCE(NEW.raw_user_meta_data->>'department', 'Unassigned'));
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Role helper. SECURITY DEFINER avoids the infinite RLS recursion that the
-- original "(SELECT role FROM profiles ...)" policies would cause on profiles.
CREATE FUNCTION current_role_of_user() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT role FROM profiles WHERE id = auth.uid() $$;

-- Recipients may only move status forward and only touch status/timestamps.
CREATE FUNCTION guard_notification_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.recipient_id <> OLD.recipient_id
     OR NEW.message <> OLD.message OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Only status fields may be updated';
  END IF;
  IF NEW.status = 'delivered' AND OLD.status = 'sent' THEN
    NEW.delivered_at := NOW();
  ELSIF NEW.status = 'acknowledged' THEN
    NEW.acknowledged_at := NOW();
    NEW.delivered_at := COALESCE(OLD.delivered_at, NOW());
  ELSIF NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid status transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER notifications_guard BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION guard_notification_update();

-- Stop users promoting themselves: only admins may change role/identity fields.
CREATE FUNCTION guard_profile_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND current_role_of_user() <> 'admin'
     AND (NEW.role <> OLD.role OR NEW.department <> OLD.department
          OR NEW.email <> OLD.email OR NEW.full_name <> OLD.full_name) THEN
    RAISE EXCEPTION 'Only admins can change these fields';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_update();

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- Admin dashboard and pickers listen to these so edits show up without re-signing in.
ALTER PUBLICATION supabase_realtime ADD TABLE profiles, groups, group_members;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Authenticated read profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage profiles" ON profiles FOR ALL TO authenticated
  USING (current_role_of_user() = 'admin') WITH CHECK (current_role_of_user() = 'admin');
CREATE POLICY "Users update own presence" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Groups
CREATE POLICY "Authenticated read groups" ON groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage groups" ON groups FOR ALL TO authenticated
  USING (current_role_of_user() = 'admin') WITH CHECK (current_role_of_user() = 'admin');
CREATE POLICY "Authenticated read members" ON group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage members" ON group_members FOR ALL TO authenticated
  USING (current_role_of_user() = 'admin') WITH CHECK (current_role_of_user() = 'admin');

-- Notifications
CREATE POLICY "Senders create notifications" ON notifications FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND status = 'sent'
              AND current_role_of_user() IN ('admin', 'sender'));
CREATE POLICY "Read own notifications" ON notifications FOR SELECT TO authenticated
  USING (auth.uid() IN (recipient_id, sender_id) OR current_role_of_user() = 'admin');
CREATE POLICY "Recipients update status" ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);
