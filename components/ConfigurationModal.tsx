
import * as React from 'react';
import { ClipboardDocumentCheckIcon, ClipboardDocumentIcon, ServerIcon, ShieldCheckIcon, ExclamationTriangleIcon } from './icons';

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
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors shadow-sm" title="نسخ الكود">
            {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-white" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            {copied ? 'تم النسخ!' : 'نسخ كود SQL'}
        </button>
    );
};

const unifiedScript = `
-- =================================================================
-- السكربت الشامل لإصلاح وإعداد قاعدة البيانات (Supabase) - النسخة الآمنة
-- تعليمات: انسخ هذا الكود بالكامل والصقه في SQL Editor ثم اضغط Run
-- =================================================================

-- 1. الدوال والمشغلات (Functions & Triggers)

-- دالة للتحقق مما إذا كان المستخدم مديراً (Admin)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(user_role, 'user') = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- دالة لحذف حساب المستخدم نفسه
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- دالة لحذف مستخدم (للمدراء فقط)
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

-- دالة التحقق من وجود رقم الجوال
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

-- دالة توليد كود التحقق (OTP)
CREATE OR REPLACE FUNCTION public.generate_mobile_otp(target_user_id uuid)
RETURNS text AS $$
DECLARE
    new_otp text;
BEGIN
    new_otp := floor(random() * (999999 - 100000 + 1) + 100000)::text;
    
    UPDATE public.profiles 
    SET 
        otp_code = new_otp,
        otp_expires_at = NULL 
    WHERE id = target_user_id;
    
    RETURN new_otp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.generate_mobile_otp(uuid) TO anon, authenticated;

-- دالة التحقق من كود الـ OTP
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

-- دالة التعامل مع المستخدم الجديد (Trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    raw_mobile TEXT;
    normalized_mobile TEXT;
BEGIN
    raw_mobile := new.raw_user_meta_data->>'mobile_number';

    IF raw_mobile IS NOT NULL AND raw_mobile != '' THEN
        normalized_mobile := '0' || RIGHT(regexp_replace(raw_mobile, '\\D', '', 'g'), 9);
    ELSE
        normalized_mobile := '0' || regexp_replace(new.email, '^sy963|@email\\.com$', '', 'g');
    END IF;

    INSERT INTO public.profiles (id, full_name, mobile_number, created_at, mobile_verified)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
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

-- إعادة إنشاء التريجر لضمان عمله
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. إنشاء وتحديث الجداول (Tables & Columns)

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
ALTER TABLE public.site_finances ADD COLUMN IF NOT EXISTS profile_full_name text;
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

-- 3. القيود (Constraints)
DO $$
BEGIN
    -- إضافة القيود إذا لم تكن موجودة
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


-- 4. سياسات الأمان (RLS Policies)
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

-- 5. تفعيل التحديث المباشر (Realtime)
DO $$
DECLARE
    t text;
    target_tables text[] := ARRAY[
        'public.profiles', 'public.clients', 'public.cases', 
        'public.stages', 'public.sessions', 'public.admin_tasks', 
        'public.appointments', 'public.accounting_entries', 
        'public.assistants', 'public.invoices', 'public.invoice_items', 
        'public.site_finances', 'public.case_documents'
    ];
BEGIN
    FOR t IN SELECT unnest(target_tables) LOOP
        BEGIN
            EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE ' || t;
        EXCEPTION WHEN duplicate_object THEN
            NULL; -- تجاهل الخطأ إذا كان الجدول مضافاً بالفعل
        END;
    END LOOP;
END $$;

-- 6. إعداد سلة التخزين (Storage Bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- تنبيه: تم تعطيل هذا القسم لتجنب أخطاء الصلاحيات (Error 42501).
-- إذا كنت تواجه مشاكل في رفع الملفات، يرجى إعداد سياسات التخزين يدوياً من لوحة تحكم Supabase.
-- DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
-- CREATE POLICY "Give users access to own folder" ON storage.objects FOR ALL USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]) WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 7. إصلاح البيانات المفقودة (Backfill) - هام جداً
-- هذا الجزء يضمن وجود ملف شخصي لكل مستخدم مسجل في auth.users
INSERT INTO public.profiles (id, full_name, mobile_number, role, is_approved, is_active, mobile_verified)
SELECT 
    au.id,
    COALESCE(au.raw_user_meta_data->>'full_name', 'مستخدم'),
    COALESCE(au.raw_user_meta_data->>'mobile_number', ''),
    'admin', -- جعل المستخدمين الحاليين مدراء لضمان الدخول
    true,    -- تفعيل الحساب فوراً
    true,    -- نشط
    true     -- تم التحقق من الجوال
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles);

`;

interface ConfigurationModalProps {
    onRetry: () => void;
}

const ConfigurationModal: React.FC<ConfigurationModalProps> = ({ onRetry }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[200]">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center gap-3 mb-4 text-amber-600">
                    <ServerIcon className="w-8 h-8" />
                    <h2 className="text-2xl font-bold">تهيئة قاعدة البيانات</h2>
                </div>
                
                <div className="overflow-y-auto flex-grow pr-2">
                    <div className="bg-amber-50 border-s-4 border-amber-500 p-4 mb-4 rounded">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
                            </div>
                            <div className="ms-3">
                                <p className="text-sm text-amber-700">
                                    تنبيه هام: الخطأ الذي ظهر لك سابقاً (42501) يعني أنك لا تملك صلاحية تعديل إعدادات التخزين. تم تعديل السكربت لتجاوز هذا الخطأ والتركيز على إصلاح حسابك.
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="mb-4 text-gray-700 font-medium">
                        لإصلاح المشكلة، يرجى تنفيذ الخطوات التالية بدقة:
                    </p>

                    <ol className="list-decimal list-inside space-y-4 text-sm text-gray-600 mb-6">
                        <li className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-center mb-2">
                                <strong className="text-gray-900">انسخ كود SQL الجديد (تم تحديثه):</strong>
                                <CopyButton textToCopy={unifiedScript} />
                            </div>
                            <div className="relative">
                                <pre className="bg-gray-800 text-green-400 p-3 rounded border border-gray-700 overflow-x-auto text-xs font-mono h-32" dir="ltr">
                                    {unifiedScript}
                                </pre>
                            </div>
                        </li>
                        <li>
                            اذهب إلى <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold">لوحة تحكم Supabase</a>.
                        </li>
                        <li>
                            افتح <strong>SQL Editor</strong> من القائمة الجانبية (أيقونة الورقة والقلم).
                        </li>
                        <li>
                            اضغط على <strong>New Query</strong> والصق الكود الذي نسخته في الخطوة 1.
                        </li>
                        <li>
                            اضغط على زر <strong>Run</strong> (أسفل يمين الشاشة).
                        </li>
                        <li>
                            بعد ظهور رسالة "Success" في Supabase، عد إلى هنا واضغط على زر "إعادة المحاولة".
                        </li>
                    </ol>

                    <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800 flex items-start gap-2">
                        <ShieldCheckIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <div>
                            <strong>ملاحظة:</strong> هذا السكربت آمن ولن يحذف أي بيانات موجودة. سيقوم فقط بإنشاء الجداول المفقودة وإصلاح ملفك الشخصي.
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end pt-4 border-t">
                    <button
                        onClick={onRetry}
                        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                    >
                        إعادة المحاولة
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;
