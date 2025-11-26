
import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { ExclamationCircleIcon, EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon } from '../components/icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
// Fix: Use `import type` for User as it is used as a type, not a value. This resolves module resolution errors in some environments.
import type { User } from '@supabase/supabase-js';

interface AuthPageProps {
    onForceSetup: () => void;
    onLoginSuccess: (user: User, isOfflineLogin?: boolean) => void;
    initialMode?: 'login' | 'signup' | 'otp';
    currentUser?: User;
    currentMobile?: string;
    onVerificationSuccess?: () => void;
    onLogout?: () => void;
}

const LAST_USER_CREDENTIALS_CACHE_KEY = 'lawyerAppLastUserCredentials';

// Helper component for copying text
const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button type="button" onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-300 hover:text-white" title="نسخ الأمر">
            {copied ? <ClipboardDocumentCheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
            {copied ? 'تم النسخ' : 'نسخ'}
        </button>
    );
};

const DatabaseIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
);

const LoginPage: React.FC<AuthPageProps> = ({ onForceSetup, onLoginSuccess, initialMode = 'login', currentUser, currentMobile, onVerificationSuccess, onLogout }) => {
    const [authStep, setAuthStep] = React.useState<'login' | 'signup' | 'otp'>(initialMode);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<React.ReactNode | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [info, setInfo] = React.useState<string | null>(null);
    const [authFailed, setAuthFailed] = React.useState(false); 
    const [showPassword, setShowPassword] = React.useState(false);
    const [otpCode, setOtpCode] = React.useState('');
    const isOnline = useOnlineStatus();

    const [form, setForm] = React.useState({
        fullName: '',
        mobile: currentMobile || '',
        password: '',
    });
    
    React.useEffect(() => {
        if (currentMobile) {
            setForm(prev => ({ ...prev, mobile: currentMobile }));
        }
    }, [currentMobile]);

    React.useEffect(() => {
        try {
            const cachedCredentialsRaw = localStorage.getItem(LAST_USER_CREDENTIALS_CACHE_KEY);
            if (cachedCredentialsRaw) {
                const cachedCredentials = JSON.parse(cachedCredentialsRaw);
                if (cachedCredentials.mobile && cachedCredentials.password) {
                    setForm(prev => ({
                        ...prev,
                        mobile: cachedCredentials.mobile,
                        password: cachedCredentials.password
                    }));
                }
            }
        } catch (e) {
            console.error("Failed to load cached credentials:", e);
            localStorage.removeItem(LAST_USER_CREDENTIALS_CACHE_KEY);
        }
    }, []);

    React.useEffect(() => {
        if (!isOnline) {
            setInfo("أنت غير متصل. تسجيل الدخول متاح فقط للمستخدم الأخير الذي سجل دخوله على هذا الجهاز.");
        } else {
            setInfo(null);
        }
    }, [isOnline]);

    const supabase = getSupabaseClient();

    const toggleView = (e: React.MouseEvent) => {
        e.preventDefault();
        setAuthStep(prev => prev === 'login' ? 'signup' : 'login');
        setError(null);
        setMessage(null);
        setInfo(isOnline ? null : "أنت غير متصل. تسجيل الدخول متاح فقط للمستخدم الأخير الذي سجل دخوله على هذا الجهاز.");
        setAuthFailed(false);
    };

    const normalizeMobileToE164 = (mobile: string): string | null => {
        const digits = mobile.replace(/\D/g, '');
        if (digits.length >= 9) {
            const lastNine = digits.slice(-9);
            if (lastNine.startsWith('9')) {
                return `+963${lastNine}`;
            }
        }
        return null;
    };
    
    const normalizeMobileForDB = (mobile: string): string | null => {
        const digits = mobile.replace(/\D/g, '');
        if (digits.length >= 9) {
            const lastNine = digits.slice(-9);
            if (lastNine.startsWith('9')) {
                return '0' + lastNine;
            }
        }
        return null;
    };


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
        if (error) setError(null);
        if (authFailed) setAuthFailed(false);
    };

    const handleOtpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (!supabase) throw new Error("Client not initialized");
            const normalizedMobile = normalizeMobileForDB(form.mobile);
            
            if (!normalizedMobile) {
                throw new Error("رقم الجوال غير صالح.");
            }

            const cleanOtp = otpCode.trim();

            const { data: isVerified, error: rpcError } = await supabase.rpc('verify_mobile_otp', {
                target_mobile: normalizedMobile,
                code_to_check: cleanOtp
            });

            if (rpcError) {
                if (rpcError.message.includes("function") && rpcError.message.includes("not exist")) {
                    throw new Error("خطأ في إعداد النظام: يرجى من المدير تشغيل سكربت تأكيد الجوال.");
                }
                throw rpcError;
            }

            if (isVerified) {
                if (onVerificationSuccess) {
                    onVerificationSuccess();
                } else {
                    setMessage("تم التحقق من رقم الجوال بنجاح. جاري تسجيل الدخول...");
                    // Re-login to ensure session and data refresh
                    if (form.password) {
                        const phone = normalizeMobileToE164(form.mobile);
                        const email = `sy${phone!.substring(1)}@email.com`;
                        const { data: signInData } = await supabase.auth.signInWithPassword({ email, password: form.password });
                        if(signInData.user) onLoginSuccess(signInData.user);
                    } else {
                        setAuthStep('login');
                        setOtpCode('');
                    }
                }
            } else {
                throw new Error("رمز التحقق غير صحيح.");
            }

        } catch (err: any) {
            let errorMsg = err.message || "فشل التحقق من الكود.";
            // Clean up common RPC error prefixes if present
            if (errorMsg.includes("No OTP found")) {
                errorMsg = "لم يتم العثور على كود تفعيل لهذا الرقم. يرجى التواصل مع الإدارة.";
            }
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        setAuthFailed(false);
    
        const phone = normalizeMobileToE164(form.mobile);
        if (!phone) {
            setError('رقم الجوال غير صالح. يجب أن يكون رقماً سورياً صحيحاً (مثال: 0912345678).');
            setLoading(false);
            setAuthFailed(true);
            return;
        }
        const email = `sy${phone.substring(1)}@email.com`;
    
        if (!supabase) {
            setError("Supabase client is not available.");
            setLoading(false);
            return;
        }
    
        const performOfflineLogin = () => {
            try {
                const LAST_USER_CACHE_KEY = 'lawyerAppLastUser';
                const LOGGED_OUT_KEY = 'lawyerAppLoggedOut';
                
                const cachedCredentialsRaw = localStorage.getItem(LAST_USER_CREDENTIALS_CACHE_KEY);
                const lastUserRaw = localStorage.getItem(LAST_USER_CACHE_KEY);
        
                if (authStep !== 'login') {
                     throw new Error('لا يمكن إنشاء حساب جديد بدون اتصال بالإنترنت.');
                }
    
                if (!cachedCredentialsRaw || !lastUserRaw) {
                    throw new Error('فشل الاتصال بالخادم، ولا يوجد حساب مخزّن على هذا الجهاز. يرجى الاتصال بالإنترنت.');
                }
    
                const cachedCredentials = JSON.parse(cachedCredentialsRaw);
                const normalize = (numStr: string) => (numStr || '').replace(/\D/g, '').slice(-9);
                
                if (normalize(cachedCredentials.mobile) === normalize(form.mobile) && cachedCredentials.password === form.password) {
                    localStorage.removeItem(LOGGED_OUT_KEY);
                    const user = JSON.parse(lastUserRaw) as User;
                    onLoginSuccess(user, true);
                } else {
                    throw new Error('بيانات الدخول غير صحيحة للوصول بدون انترنت.');
                }
            } catch (offlineErr: any) {
                setError(offlineErr.message);
                setAuthFailed(true);
            } finally {
                setLoading(false);
            }
        };
    
        if (authStep === 'login') {
            if (!isOnline) {
                console.log("Offline mode detected, attempting offline login directly.");
                performOfflineLogin();
                return;
            }
    
            try {
                const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password: form.password });
                if (signInError) throw signInError;
                
                // Check mobile verification status
                if (signInData.user) {
                    const { data: profile } = await supabase.from('profiles').select('mobile_verified, role').eq('id', signInData.user.id).single();
                    
                    // Check verification ONLY if the user is NOT an admin
                    if (profile && profile.mobile_verified === false && profile.role !== 'admin') {
                        // Not verified, send to OTP screen
                        setMessage("يرجى تأكيد رقم الجوال للمتابعة.");
                        setAuthStep('otp');
                        setLoading(false);
                        return;
                    }
                    
                    // Verified or is Admin, proceed to login
                    localStorage.setItem(LAST_USER_CREDENTIALS_CACHE_KEY, JSON.stringify({
                        mobile: form.mobile,
                        password: form.password,
                    }));
                    // App.tsx handles the session state change automatically via onAuthStateChange,
                    // but we can explicitly call this if needed. The logic in App.tsx is primary.
                }

            } catch (err: any) {
                const errorMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
                const lowerMsg = String(errorMsg).toLowerCase();
                
                const isNetworkError = lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror');
                const isAuthError = lowerMsg.includes('invalid login credentials') || lowerMsg.includes('invalid credentials');

                if (isNetworkError) {
                    console.warn('Online login failed due to network issue. Attempting offline fallback.');
                    setInfo("فشل الاتصال بالخادم. جاري محاولة تسجيل الدخول دون اتصال...");
                    performOfflineLogin();
                    return;
                }
                
                let displayError: React.ReactNode = 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
    
                if (isAuthError) {
                    displayError = "بيانات الدخول غير صحيحة. يرجى التحقق من رقم الجوال وكلمة المرور.";
                    setAuthFailed(true);
                } else if (lowerMsg.includes('email not confirmed')) {
                    displayError = "الحساب غير مفعل. يرجى تأكيد رقم الجوال أو التواصل مع المسؤول.";
                } else if (lowerMsg.includes('database is not configured')) {
                    displayError = (
                        <div className="text-right w-full">
                            <p className="font-bold mb-2">خطأ: قاعدة البيانات غير مهيأة</p>
                            <button onClick={onForceSetup} className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
                                <DatabaseIcon />
                                <span>الانتقال إلى صفحة الإعداد</span>
                            </button>
                        </div>
                    );
                }
    
                setError(displayError);
                setLoading(false);
            }
        } else { // Sign up
            try {
                if (!isOnline) {
                    throw new Error('لا يمكن إنشاء حساب جديد بدون اتصال بالإنترنت.');
                }
                
                const normalizedMobile = normalizeMobileForDB(form.mobile);
                if (!normalizedMobile) {
                    setError('رقم الجوال غير صالح.');
                    setLoading(false);
                    setAuthFailed(true);
                    return;
                }

                const { data: mobileExists, error: rpcError } = await supabase.rpc('check_if_mobile_exists', {
                    mobile_to_check: normalizedMobile
                });

                if (rpcError) console.warn("RPC error checking mobile:", rpcError);

                if (mobileExists === true) {
                    setError('هذا الرقم مسجل بالفعل. يرجى تسجيل الدخول أو استخدام رقم جوال آخر.');
                    setLoading(false);
                    setAuthFailed(true);
                    return;
                }
    
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password: form.password,
                    options: { data: { full_name: form.fullName, mobile_number: form.mobile } }
                });
    
                if (signUpError) throw signUpError;
                
                if (data.user) {
                    // Generate OTP immediately so Admin can see it
                    try {
                        await supabase.rpc('generate_mobile_otp', { target_user_id: data.user.id });
                    } catch (e) {
                        console.error("Failed to generate initial OTP", e);
                    }

                    setMessage("تم إنشاء الحساب بنجاح. يرجى التواصل مع المدير لاستلام كود التفعيل وإدخاله هنا.");
                    setAuthStep('otp');
                } else {
                    throw new Error("لم يتم إرجاع بيانات المستخدم.");
                }
            } catch (err: any) {
                const lowerMsg = String(err.message).toLowerCase();
                if (lowerMsg.includes('user already registered')) {
                    setError('هذا الحساب مسجل بالفعل.');
                } else {
                    setError('فشل إنشاء الحساب: ' + err.message);
                }
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4" dir="rtl">
            <div className="w-full max-w-md">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-gray-800">مكتب المحامي</h1>
                    <p className="text-gray-500">إدارة أعمال المحاماة بكفاءة</p>
                </div>

                <div className="bg-white p-8 rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold text-center text-gray-700 mb-6">
                        {authStep === 'login' ? 'تسجيل الدخول' : (authStep === 'signup' ? 'إنشاء حساب جديد' : 'تأكيد رقم الجوال')}
                    </h2>

                    {error && (
                        <div className="mb-4 p-4 text-sm text-red-800 bg-red-100 rounded-lg flex items-start gap-3">
                            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div>{error}</div>
                        </div>
                    )}
                    {message && <div className="mb-4 p-4 text-sm text-green-800 bg-green-100 rounded-lg flex items-center gap-2"><CheckCircleIcon className="w-5 h-5"/>{message}</div>}
                    {info && <div className="mb-4 p-4 text-sm text-blue-800 bg-blue-100 rounded-lg">{info}</div>}

                    {authStep === 'otp' ? (
                        <div className="space-y-6">
                            <div className="text-center text-gray-600 text-sm">
                                <p>يرجى إدخال كود التحقق الذي تم إرساله إلى الرقم:</p>
                                <p className="font-bold text-gray-800 mt-1" dir="ltr">{form.mobile}</p>
                                <p className="mt-4 text-xs text-gray-500 bg-yellow-50 p-3 rounded border border-yellow-200">
                                    <strong>تنبيه:</strong> يتم إرسال الكود يدوياً من قبل الإدارة. يرجى التواصل مع المدير عبر واتساب لاستلام الكود.
                                </p>
                            </div>
                            
                            <form onSubmit={handleOtpSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 text-center">كود التحقق (6 أرقام)</label>
                                    <input 
                                        type="text" 
                                        value={otpCode} 
                                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="mt-2 block w-full text-center text-2xl tracking-widest px-3 py-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="------"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <button type="submit" disabled={loading || otpCode.length !== 6} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-green-300">
                                    {loading ? 'جاري التحقق...' : 'تأكيد الكود'}
                                </button>
                            </form>
                            
                            <div className="text-center">
                                <p className="text-xs text-green-600 font-semibold">الكود صالح للاستخدام (لا تنتهي صلاحيته).</p>
                                
                                {onLogout ? (
                                    <button onClick={onLogout} className="mt-4 text-sm text-gray-600 hover:underline">تسجيل الخروج</button>
                                ) : (
                                    <button onClick={() => setAuthStep('login')} className="mt-4 text-sm text-blue-600 hover:underline">العودة</button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleAuth} className="space-y-6">
                            {authStep === 'signup' && (
                                <div>
                                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">الاسم الكامل</label>
                                    <input id="fullName" name="fullName" type="text" value={form.fullName} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                                </div>
                            )}

                            <div>
                                <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">رقم الجوال</label>
                                <input id="mobile" name="mobile" type="tel" value={form.mobile} onChange={handleInputChange} required placeholder="09xxxxxxxx" className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${authFailed ? 'border-red-500' : 'border-gray-300'}`} />
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700">كلمة المرور</label>
                                <div className="relative mt-1">
                                    <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={handleInputChange} required className={`block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${authFailed ? 'border-red-500' : 'border-gray-300'}`} />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 left-0 px-3 flex items-center text-gray-400">
                                        {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <button type="submit" disabled={loading || (!isOnline && authStep === 'signup')} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300">
                                    {loading ? 'جاري التحميل...' : (authStep === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب')}
                                </button>
                            </div>
                        </form>
                    )}

                    {authStep !== 'otp' && (
                        <p className="mt-6 text-center text-sm text-gray-600">
                            {authStep === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
                            <a href="#" onClick={toggleView} className="font-medium text-blue-600 hover:text-blue-500 ms-1">
                                {authStep === 'login' ? 'أنشئ حساباً جديداً' : 'سجل الدخول'}
                            </a>
                        </p>
                    )}
                </div>

                <div className="mt-6 text-center">
                    <a href="https://joint-fish-ila1mb4.gamma.site/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 hover:underline">
                        <span>زيارة الصفحة الرئيسية للتطبيق</span>
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
                </div>
                
                <div className="mt-4 flex flex-col items-center">
                    <p className="text-center text-xs text-gray-500">كافة الحقوق محفوظة لشركة الحلول الرقمية Digital Solutions</p>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-400">الإصدار: 27-11-2025-2</p>
                        <button onClick={onForceSetup} className="text-xs text-gray-300 hover:text-gray-500" title="إعداد النظام">
                            <DatabaseIcon className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;