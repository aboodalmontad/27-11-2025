
import * as React from 'react';
import { getSupabaseClient } from '../supabaseClient';
import { Profile } from '../types';
import { formatDate, toInputDateString } from '../utils/dateUtils';
import { CheckCircleIcon, NoSymbolIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon, PhoneIcon, ShareIcon, ArrowPathIcon, ClipboardDocumentIcon } from '../components/icons';
import { useData } from '../context/DataContext';
import UserDetailsModal from '../components/UserDetailsModal';

const formatSubscriptionDateRange = (user: Profile): string => {
    const { subscription_start_date, subscription_end_date } = user;
    if (!subscription_start_date || !subscription_end_date) return 'لا يوجد';
    const startDate = new Date(subscription_start_date);
    const endDate = new Date(subscription_end_date);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 'تاريخ غير صالح';
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};

const getDisplayPhoneNumber = (mobile: string | null | undefined): string => {
    if (!mobile) return '-';
    const digits = mobile.replace(/\D/g, '');
    if (digits.length >= 9) {
        const lastNine = digits.slice(-9);
        if (lastNine.startsWith('9')) return '0' + lastNine;
    }
    return mobile;
};

const AdminPage: React.FC = () => {
    const { profiles: users, setProfiles: setUsers, isDataLoading: loading, userId } = useData();
    const [error, setError] = React.useState<string | null>(null);
    const [editingUser, setEditingUser] = React.useState<Profile | null>(null);
    const [userToDelete, setUserToDelete] = React.useState<Profile | null>(null);
    const [viewingUser, setViewingUser] = React.useState<Profile | null>(null);
    const [generatingOtpFor, setGeneratingOtpFor] = React.useState<string | null>(null);
    const [copiedOtpId, setCopiedOtpId] = React.useState<string | null>(null);
    const currentAdminId = userId;
    
    const supabase = getSupabaseClient();

    const handleUpdateUser = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingUser) return;
        
        setUsers(prevUsers => prevUsers.map(u => 
            u.id === editingUser.id ? { ...editingUser, updated_at: new Date() } : u
        ));

        setEditingUser(null);
    };

    const handleConfirmDelete = async () => {
        if (!supabase || !userToDelete) return;
        const userToDeleteId = userToDelete.id;
    
        try {
            const { error: rpcError } = await supabase.rpc('delete_user', {
                user_id_to_delete: userToDeleteId
            });
    
            if (rpcError) throw rpcError;
            setUsers(prevUsers => prevUsers.filter(u => u.id !== userToDeleteId));
            
        } catch (err: any) {
            setError("فشل حذف المستخدم: " + err.message);
        } finally {
            setUserToDelete(null);
        }
    };
    
    const toggleUserApproval = (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const updatedUser = { ...user, is_approved: !user.is_approved, updated_at: new Date() };
         setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    }
    
    const toggleUserActiveStatus = (user: Profile) => {
         if (!supabase || user.role === 'admin') return;
         const updatedUser = { ...user, is_active: !user.is_active, updated_at: new Date() };
         setUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
    }

    const handleGenerateAndSendOtp = async (user: Profile) => {
        if (!supabase) return;
        setGeneratingOtpFor(user.id);
        try {
            const { data: code, error } = await supabase.rpc('generate_mobile_otp', {
                target_user_id: user.id
            });

            if (error) throw error;

            if (code) {
                // Update local state to show code immediately without refresh
                setUsers(prev => prev.map(u => u.id === user.id ? { ...u, otp_code: code } : u));

                const cleanMobile = user.mobile_number.replace(/\D/g, '').replace(/^0+/, ''); 
                const waNumber = `963${cleanMobile}`; // Assuming Syrian numbers
                const message = `كود التحقق الخاص بك لمكتب المحامي هو: *${code}*`;
                const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
                window.open(url, '_blank');
            }
        } catch (err: any) {
            console.error("Error generating OTP:", err);
            alert("فشل توليد كود التحقق: " + err.message);
        } finally {
            setGeneratingOtpFor(null);
        }
    };

    const copyToClipboard = (text: string, id: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopiedOtpId(id);
            setTimeout(() => setCopiedOtpId(null), 2000);
        });
    };
    
    const sortedUsers = React.useMemo(() => {
        return [...users].sort((a, b) => {
            // Sort priority: Not Approved > Not Verified > Newest
            if (!a.is_approved && b.is_approved) return -1;
            if (a.is_approved && !b.is_approved) return 1;
            
            if (!a.mobile_verified && b.mobile_verified) return -1;
            if (a.mobile_verified && !b.mobile_verified) return 1;

            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });
    }, [users]);


    if (loading) {
        return <div className="text-center p-8">جاري تحميل المستخدمين...</div>;
    }

    if (error) {
        return <div className="p-4 text-red-700 bg-red-100 rounded-md">{error}</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">إدارة المستخدمين</h1>
            
            <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">الاسم الكامل</th>
                            <th className="px-6 py-3">رقم الجوال</th>
                            <th className="px-6 py-3">تاريخ التسجيل</th>
                            <th className="px-6 py-3">التحقق من الجوال</th>
                            <th className="px-6 py-3">موافق عليه</th>
                            <th className="px-6 py-3">الحساب نشط</th>
                            <th className="px-6 py-3">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map(user => (
                            <tr key={user.id} className={`border-b ${!user.is_approved ? 'bg-yellow-50' : 'bg-white'}`}>
                                <td className="px-6 py-4 font-medium text-gray-900">
                                    <button onClick={() => setViewingUser(user)} className="text-blue-600 hover:underline">
                                        {user.full_name}
                                    </button>
                                    {user.role === 'admin' && <span className="text-xs font-semibold text-blue-600 ms-2">(مدير)</span>}
                                </td>
                                <td className="px-6 py-4" dir="ltr">{getDisplayPhoneNumber(user.mobile_number)}</td>
                                <td className="px-6 py-4">{user.created_at ? formatDate(new Date(user.created_at)) : '-'}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {user.mobile_verified ? (
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                                تم التحقق
                                            </span>
                                        ) : (
                                            <div className="flex flex-col gap-2 w-full max-w-[140px]">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                                        غير مؤكد
                                                    </span>
                                                    {user.role !== 'admin' && (
                                                        <button 
                                                            onClick={() => handleGenerateAndSendOtp(user)}
                                                            disabled={generatingOtpFor === user.id}
                                                            className="text-blue-600 hover:text-blue-800 disabled:opacity-50 p-1 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
                                                            title="إرسال كود التحقق عبر واتساب"
                                                        >
                                                            {generatingOtpFor === user.id ? <ArrowPathIcon className="w-4 h-4 animate-spin"/> : <ShareIcon className="w-4 h-4" />}
                                                        </button>
                                                    )}
                                                </div>
                                                <div 
                                                    className={`flex items-center justify-center gap-2 text-xs font-bold border rounded-md px-2 py-1.5 cursor-pointer transition-all ${user.otp_code ? 'text-blue-700 bg-blue-50 border-blue-300 hover:bg-blue-100' : 'text-gray-400 bg-gray-50 border-gray-200'}`}
                                                    title={user.otp_code ? "نسخ الكود" : "لا يوجد كود نشط"}
                                                    onClick={() => user.otp_code && copyToClipboard(user.otp_code, user.id)}
                                                >
                                                    {user.otp_code ? (
                                                        <>
                                                            <span className="font-mono text-sm tracking-wider">{user.otp_code}</span>
                                                            <ClipboardDocumentIcon className="w-3 h-3 text-blue-500" />
                                                        </>
                                                    ) : (
                                                        <span>- - - - - -</span>
                                                    )}
                                                </div>
                                                {copiedOtpId === user.id && <span className="text-[10px] text-green-600 text-center font-bold">تم النسخ!</span>}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <button onClick={() => toggleUserApproval(user)} disabled={user.role === 'admin'} className="disabled:opacity-50 disabled:cursor-not-allowed" title="تفعيل/تعطيل الموافقة">
                                        {user.is_approved ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : <NoSymbolIcon className="w-6 h-6 text-gray-400" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                     <button onClick={() => toggleUserActiveStatus(user)} disabled={user.role === 'admin'} className="disabled:opacity-50 disabled:cursor-not-allowed" title="تجميد/تنشيط الحساب">
                                        {user.is_active ? <CheckCircleIcon className="w-6 h-6 text-green-500" /> : <NoSymbolIcon className="w-6 h-6 text-red-500" />}
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    {user.role !== 'admin' && user.id !== currentAdminId ? (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setEditingUser(user)} className="p-2 text-gray-500 hover:text-blue-600" title="تعديل"><PencilIcon className="w-4 h-4" /></button>
                                            <button onClick={() => setUserToDelete(user)} className="p-2 text-gray-500 hover:text-red-600" title="حذف"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-400">محمي</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setEditingUser(null)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">تعديل المستخدم: {editingUser.full_name}</h2>
                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700">الاسم الكامل</label><input type="text" value={editingUser.full_name} onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })} className="w-full p-2 border rounded" /></div>
                            <div><label className="block text-sm font-medium text-gray-700">رقم الجوال</label><input type="text" value={editingUser.mobile_number} onChange={e => setEditingUser({ ...editingUser, mobile_number: e.target.value })} className="w-full p-2 border rounded" dir="ltr" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700">تاريخ بدء الاشتراك</label><input type="date" value={toInputDateString(editingUser.subscription_start_date)} onChange={e => setEditingUser({ ...editingUser, subscription_start_date: e.target.value })} className="w-full p-2 border rounded" /></div>
                                <div><label className="block text-sm font-medium text-gray-700">تاريخ انتهاء الاشتراك</label><input type="date" value={toInputDateString(editingUser.subscription_end_date)} onChange={e => setEditingUser({ ...editingUser, subscription_end_date: e.target.value })} className="w-full p-2 border rounded" /></div>
                            </div>
                            <div className="flex items-center gap-6 pt-2 flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_approved} onChange={e => setEditingUser({ ...editingUser, is_approved: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> موافق عليه</label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.is_active} onChange={e => setEditingUser({ ...editingUser, is_active: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> الحساب نشط</label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingUser.mobile_verified} onChange={e => setEditingUser({ ...editingUser, mobile_verified: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" /> تم التحقق من الجوال</label>
                            </div>
                            <div className="flex justify-end gap-4 pt-4"><button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ التغييرات</button></div>
                        </form>
                    </div>
                </div>
            )}
            
             {userToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setUserToDelete(null)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                         <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف المستخدم</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف المستخدم "{userToDelete.full_name}"؟ سيتم حذف جميع بياناته بشكل نهائي ولا يمكن التراجع عن هذا الإجراء.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setUserToDelete(null)}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={handleConfirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}

            {viewingUser && (
                <UserDetailsModal 
                    user={viewingUser} 
                    onClose={() => setViewingUser(null)}
                    onEdit={() => setEditingUser(viewingUser)}
                />
            )}
        </div>
    );
};

export default AdminPage;
