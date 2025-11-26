
import * as React from 'react';
import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, ServerIcon, ShieldCheckIcon } from './icons';

// Helper component for copying text (Internal)
const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors" title="نسخ الكود">
            {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-green-600" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            {copied ? 'تم النسخ' : 'نسخ'}
        </button>
    );
};

const unifiedScript = `
-- =================================================================
-- السكربت الشامل (الإعداد الكامل - ينشئ الجداول إذا لم تكن موجودة)
-- =================================================================

-- 1. FUNCTIONS & TRIGGERS

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(user_role, 'user') = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_user(user_id_to_delete uuid)
RETURNS void AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only admins can delete users.';
    END IF;
    IF auth.uid() = user_id_to_delete THEN
        RAISE EXCEPTION 'Admins cannot delete their own account from the admin panel.';
    END IF;
    DELETE FROM auth.users WHERE id = user_id_to_delete;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
GRANT EXECUTE ON FUNCTION public.delete_user(user_id_to_delete uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_if_mobile_exists(mobile_to_check text)
RETURNS boolean AS $$
DECLARE
    mobile_exists boolean;
BEGIN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE mobile_number = mobile_to_check) INTO mobile_exists;
    RETURN mobile_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.check_if_mobile_exists(text) TO anon, authenticated;

-- Function to generate OTP (Admin or System calls this)
CREATE OR REPLACE FUNCTION public.generate_mobile_otp(target_user_id uuid)
RETURNS text AS $$
DECLARE
    new_otp text;
BEGIN
    -- Generate a random 6-digit code
    new_otp := floor(random() * (999999 - 100000 + 1) + 100000)::text;
    
    UPDATE public.profiles 
    SET 
        otp_code = new_otp,
        otp_expires_at = NULL -- VALID FOREVER (NO EXPIRATION)
    WHERE id = target_user_id;
    
    RETURN new_otp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.generate_mobile_otp(uuid) TO anon, authenticated;

-- Function to verify OTP (User calls this)
CREATE OR REPLACE FUNCTION public.verify_mobile_otp(target_mobile text, code_to_check text)
RETURNS boolean AS $$
DECLARE
    profile_record record;
BEGIN
    SELECT * INTO profile_record FROM public.profiles WHERE mobile_number = target_mobile;
    
    IF profile_record IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    IF profile_record.otp_code IS NULL THEN
        RAISE EXCEPTION 'No OTP found.';
    END IF;

    -- Check if OTP matches (No time check needed as it is valid forever)
    IF profile_record.otp_code = code_to_check THEN
        UPDATE public.profiles 
        SET 
            mobile_verified = true,
            otp_code = null,
            otp_expires_at = null
        WHERE id = profile_record.id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.verify_mobile_otp(text, text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    raw_mobile TEXT;
    normalized_mobile TEXT;
BEGIN
    -- Get mobile from metadata
    raw_mobile := new.raw_user_meta_data->>'mobile_number';

    -- Normalize the mobile number to '09xxxxxxxx' format
    IF raw_mobile IS NOT NULL AND raw_mobile != '' THEN
        -- Remove non-digits and get the last 9 digits, then prepend '0'
        normalized_mobile := '0' || RIGHT(regexp_replace(raw_mobile, '\D', '', 'g'), 9);
    ELSE
        normalized_mobile := '0' || regexp_replace(new.email, '^sy963|@email\\.com$', '', 'g');
    END IF;

    INSERT INTO public.profiles (id, full_name, mobile_number, created_at, mobile_verified)
    VALUES (
      new.id,
      new.raw_user_meta_data->>'full_name',
      normalized_mobile,
      new.created_at,
      false 
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      mobile_number = EXCLUDED.mobile_number,
      created_at = EXCLUDED.created_at;

    UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = new.id;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. TABLE & SCHEMA CREATION / MIGRATION (Non-Destructive)

CREATE TABLE IF NOT EXISTS public.profiles (id uuid NOT NULL PRIMARY KEY);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_verified boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_start_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_end_date date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.assistants (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY);
ALTER TABLE public.assistants ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.assistants ADD COLUMN IF NOT EXISTS name text NOT NULL;

CREATE TABLE IF NOT EXISTS public.clients (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_info text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.cases (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS client_id text NOT NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS subject text NOT NULL;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS opponent_name text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS fee_agreement text;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.stages (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS case_id text NOT NULL;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS court text NOT NULL;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS case_number text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS first_session_date timestamptz;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_date timestamptz;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_number text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_summary text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS decision_notes text;
ALTER TABLE public.stages ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.sessions (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS stage_id text NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS court text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS case_number text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS date timestamptz NOT NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS opponent_name text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS postponement_reason text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS next_postponement_reason text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS is_postponed boolean DEFAULT false;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS next_session_date timestamptz;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS assignee text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.admin_tasks (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS task text NOT NULL;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS due_date timestamptz NOT NULL;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS importance text DEFAULT 'normal';
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS assignee text;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS order_index integer;
ALTER TABLE public.admin_tasks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.appointments (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS title text NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS "time" text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS date timestamptz NOT NULL;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS importance text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS notified boolean;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS reminder_time_in_minutes integer;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS assignee text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.accounting_entries (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS type text NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS amount real NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS date timestamptz NOT NULL;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS case_id text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.accounting_entries ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.invoices (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_id text NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS case_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS case_subject text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issue_date timestamptz NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS due_date timestamptz NOT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_rate real DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount real DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.invoice_items (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS invoice_id text NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS description text NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS amount real NOT NULL;
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.site_finances (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY);
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS type text DEFAULT 'income' NOT NULL;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS payment_date date NOT NULL;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS amount real NOT NULL;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.case_documents (id text NOT NULL PRIMARY KEY);
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS case_id text NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS name text NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS type text NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS size real NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS added_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.case_documents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 3. CONSTRAINTS (Non-Destructive)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_fkey') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_mobile_number_key') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_mobile_number_key UNIQUE (mobile_number); END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assistants_user_id_fkey') THEN
        ALTER TABLE public.assistants ADD CONSTRAINT assistants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assistants_user_id_name_key') THEN
        ALTER TABLE public.assistants ADD CONSTRAINT assistants_user_id_name_key UNIQUE (user_id, name); END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_user_id_fkey') THEN
        ALTER TABLE public.clients ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_user_id_fkey') THEN
        ALTER TABLE public.cases ADD CONSTRAINT cases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cases_client_id_fkey') THEN
        ALTER TABLE public.cases ADD CONSTRAINT cases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_user_id_fkey') THEN
        ALTER TABLE public.stages ADD CONSTRAINT stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_case_id_fkey') THEN
        ALTER TABLE public.stages ADD CONSTRAINT stages_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fkey') THEN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_stage_id_fkey') THEN
        ALTER TABLE public.sessions ADD CONSTRAINT sessions_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_tasks_user_id_fkey') THEN
        ALTER TABLE public.admin_tasks ADD CONSTRAINT admin_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_user_id_fkey') THEN
        ALTER TABLE public.appointments ADD CONSTRAINT appointments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_entries_user_id_fkey') THEN
        ALTER TABLE public.accounting_entries ADD CONSTRAINT accounting_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_user_id_fkey') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_client_id_fkey') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_case_id_fkey') THEN
        ALTER TABLE public.invoices ADD CONSTRAINT invoices_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL; END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_user_id_fkey') THEN
        ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_invoice_id_fkey') THEN
        ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_finances_user_id_fkey') THEN
        ALTER TABLE public.site_finances ADD CONSTRAINT site_finances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL; END IF;
        
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_user_id_fkey') THEN
        ALTER TABLE public.case_documents ADD CONSTRAINT case_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_case_id_fkey') THEN
        ALTER TABLE public.case_documents ADD CONSTRAINT case_documents_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE; END IF;
END $$;


-- 4. SECURITY: RLS POLICIES
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT 'DROP POLICY IF EXISTS "' || policyname || '" ON public.' || tablename || ';' as statement FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE r.statement;
    END LOOP;
END$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin());

ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own assistants" ON public.assistants FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assistants" ON public.assistants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assistants" ON public.assistants FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assistants" ON public.assistants FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own clients" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clients" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clients" ON public.clients FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own cases" ON public.cases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cases" ON public.cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cases" ON public.cases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cases" ON public.cases FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own stages" ON public.stages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stages" ON public.stages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stages" ON public.stages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own stages" ON public.stages FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.sessions FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own admin_tasks" ON public.admin_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own admin_tasks" ON public.admin_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own admin_tasks" ON public.admin_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own admin_tasks" ON public.admin_tasks FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own appointments" ON public.appointments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own appointments" ON public.appointments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own appointments" ON public.appointments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own appointments" ON public.appointments FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own accounting_entries" ON public.accounting_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounting_entries" ON public.accounting_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounting_entries" ON public.accounting_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounting_entries" ON public.accounting_entries FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own invoices" ON public.invoices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own invoices" ON public.invoices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own invoices" ON public.invoices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own invoices" ON public.invoices FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own invoice_items" ON public.invoice_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own invoice_items" ON public.invoice_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own invoice_items" ON public.invoice_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own invoice_items" ON public.invoice_items FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.site_finances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage site finances" ON public.site_finances FOR ALL USING (public.is_admin());

ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own documents" ON public.case_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own documents" ON public.case_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.case_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.case_documents FOR DELETE USING (auth.uid() = user_id);

-- 5. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounting_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assistants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_finances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.case_documents;

-- 6. STORAGE BUCKET (Idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Give users access to own folder" ON storage.objects FOR ALL USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
`;

const mobileVerificationScript = `
-- =================================================================
-- سكربت تأكيد الجوال (Mobile Verification Script)
-- استخدم هذا السكربت لتحديث قاعدة البيانات لدعم ميزة الـ OTP
-- =================================================================

-- 1. إضافة الأعمدة الجديدة لجدول الملفات الشخصية (profiles)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_verified boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz;

-- 2. دالة التحقق من وجود الرقم (للتأكد قبل التسجيل)
CREATE OR REPLACE FUNCTION public.check_if_mobile_exists(mobile_to_check text)
RETURNS boolean AS $$
DECLARE
    mobile_exists boolean;
BEGIN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE mobile_number = mobile_to_check) INTO mobile_exists;
    RETURN mobile_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.check_if_mobile_exists(text) TO anon, authenticated;

-- 3. دالة توليد كود التحقق (يستخدمها المدير أو النظام)
CREATE OR REPLACE FUNCTION public.generate_mobile_otp(target_user_id uuid)
RETURNS text AS $$
DECLARE
    new_otp text;
BEGIN
    -- توليد كود عشوائي من 6 أرقام
    new_otp := floor(random() * (999999 - 100000 + 1) + 100000)::text;
    
    UPDATE public.profiles 
    SET 
        otp_code = new_otp,
        otp_expires_at = NULL -- صلاحية مفتوحة (لا تنتهي)
    WHERE id = target_user_id;
    
    RETURN new_otp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.generate_mobile_otp(uuid) TO anon, authenticated;

-- 4. دالة التحقق من الكود (يستخدمها المستخدم)
CREATE OR REPLACE FUNCTION public.verify_mobile_otp(target_mobile text, code_to_check text)
RETURNS boolean AS $$
DECLARE
    profile_record record;
BEGIN
    SELECT * INTO profile_record FROM public.profiles WHERE mobile_number = target_mobile;
    
    IF profile_record IS NULL THEN
        RAISE EXCEPTION 'User not found.';
    END IF;

    IF profile_record.otp_code IS NULL THEN
        RAISE EXCEPTION 'No OTP found.';
    END IF;

    -- التحقق من صحة الكود (تمت إزالة التحقق من الوقت لجعل الصلاحية مفتوحة)
    IF profile_record.otp_code = code_to_check THEN
        UPDATE public.profiles 
        SET 
            mobile_verified = true,
            otp_code = null,
            otp_expires_at = null
        WHERE id = profile_record.id;
        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.verify_mobile_otp(text, text) TO anon, authenticated;
`;

interface ConfigurationModalProps {
    onRetry: () => void;
}

const ConfigurationModal: React.FC<ConfigurationModalProps> = ({ onRetry }) => {
    const [activeTab, setActiveTab] = React.useState<'full' | 'mobile'>('full');

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-90 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
                <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 rounded-t-lg">
                    <div className="flex items-center gap-3 text-red-600">
                        <ExclamationTriangleIcon className="w-8 h-8" />
                        <h2 className="text-xl font-bold">معالج إعداد قاعدة البيانات</h2>
                    </div>
                    <button 
                        onClick={onRetry}
                        className="text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        إغلاق
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="flex border-b border-gray-200 mb-4">
                        <button
                            className={`px-4 py-2 font-medium text-sm focus:outline-none ${activeTab === 'full' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('full')}
                        >
                            الإعداد الكامل / إصلاح الأخطاء
                        </button>
                        <button
                            className={`px-4 py-2 font-medium text-sm focus:outline-none ${activeTab === 'mobile' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setActiveTab('mobile')}
                        >
                            سكربت تأكيد الجوال (جديد)
                        </button>
                    </div>

                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-md">
                        <div className="flex items-start">
                            <div className="flex-shrink-0">
                                <ServerIcon className="h-5 w-5 text-blue-400" />
                            </div>
                            <div className="ms-3">
                                <p className="text-sm text-blue-700">
                                    {activeTab === 'full' 
                                        ? "هذا السكربت يقوم بإنشاء أو تحديث جميع الجداول، الدوال، وسياسات الأمان المطلوبة لتشغيل التطبيق. إنه آمن للتنفيذ ولن يحذف بياناتك الموجودة."
                                        : "هذا السكربت مخصص لإضافة ميزة التحقق من رقم الجوال عبر OTP. قم بتشغيله إذا كنت قد قمت بإعداد قاعدة البيانات سابقاً وتريد إضافة هذه الميزة فقط."}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-gray-700">كود SQL:</label>
                            <CopyButton textToCopy={activeTab === 'full' ? unifiedScript : mobileVerificationScript} />
                        </div>
                        <div className="relative">
                            <textarea 
                                readOnly 
                                className="w-full h-64 p-4 bg-gray-800 text-green-400 font-mono text-xs rounded-lg border border-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-inner"
                                value={activeTab === 'full' ? unifiedScript : mobileVerificationScript}
                            />
                        </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                            <ShieldCheckIcon className="w-5 h-5 text-green-600"/>
                            تعليمات التنفيذ:
                        </h3>
                        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg border">
                            <li>انسخ الكود البرمجي أعلاه باستخدام زر "نسخ".</li>
                            <li>اذهب إلى لوحة تحكم مشروعك في <strong>Supabase</strong>.</li>
                            <li>انتقل إلى قسم <strong>SQL Editor</strong> من القائمة الجانبية.</li>
                            <li>انقر على <strong>New query</strong> والصق الكود المنسوخ.</li>
                            <li>اضغط على زر <strong>Run</strong> لتنفيذ السكربت.</li>
                            <li>بعد ظهور رسالة "Success"، عد إلى هنا واضغط على زر <strong>إعادة المحاولة</strong> أو قم بتحديث الصفحة.</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;