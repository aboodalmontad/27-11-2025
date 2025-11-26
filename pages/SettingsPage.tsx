import * as React from 'react';
import { TrashIcon, ExclamationTriangleIcon, CloudArrowUpIcon, ArrowPathIcon, PlusIcon, CheckCircleIcon, XCircleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ShieldCheckIcon } from '../components/icons';
import { Client, AdminTask, Appointment, AccountingEntry } from '../types';
import { APP_DATA_KEY } from '../hooks/useSupabaseData';
import { useData } from '../context/DataContext';
import { openDB } from 'idb';

interface SettingsPageProps {}

const SettingsPage: React.FC<SettingsPageProps> = () => {
    const { setFullData, assistants, setAssistants, userId, isAutoSyncEnabled, setAutoSyncEnabled, isAutoBackupEnabled, setAutoBackupEnabled, adminTasksLayout, setAdminTasksLayout, deleteAssistant, exportData } = useData();
    const [feedback, setFeedback] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = React.useState(false);
    const [isDeleteAssistantModalOpen, setIsDeleteAssistantModalOpen] = React.useState(false);
    const [assistantToDelete, setAssistantToDelete] = React.useState<string | null>(null);
    const [newAssistant, setNewAssistant] = React.useState('');
    const [dbStats, setDbStats] = React.useState<string | null>(null);
    

    const showFeedback = (message: string, type: 'success' | 'error') => {
        setFeedback({ message, type });
        setTimeout(() => setFeedback(null), 4000);
    };

    const handleConfirmClearData = () => {
        try {
            const emptyData = {
                clients: [],
                adminTasks: [],
                appointments: [],
                accountingEntries: [],
                assistants: ['بدون تخصيص'],
            };
            setFullData(emptyData);
            showFeedback('تم مسح جميع البيانات بنجاح.', 'success');
        } catch (error) {
            console.error('Failed to clear data:', error);
            showFeedback('حدث خطأ أثناء مسح البيانات.', 'error');
        }
        setIsConfirmModalOpen(false);
    };

    const handleExportData = () => {
        if (exportData()) {
            showFeedback('تم تصدير البيانات بنجاح.', 'success');
        } else {
            showFeedback('فشل تصدير البيانات.', 'error');
        }
    };

    const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("File could not be read.");
                const data = JSON.parse(text);
                setFullData(data);
                showFeedback('تم استيراد البيانات بنجاح. سيتم تحديث الصفحة.', 'success');
            } catch (error) {
                console.error("Failed to import data:", error);
                showFeedback('فشل استيراد البيانات. تأكد من أن الملف صحيح.', 'error');
            }
        };
        reader.readAsText(file);
    };


    const handleAddAssistant = (e: React.FormEvent) => {
        e.preventDefault();
        if (newAssistant && !assistants.includes(newAssistant) && newAssistant !== 'بدون تخصيص') {
            setAssistants(prev => [...prev, newAssistant.trim()]);
            setNewAssistant('');
        }
    };

    const handleDeleteAssistant = (name: string) => {
        if (name !== 'بدون تخصيص') {
            setAssistantToDelete(name);
            setIsDeleteAssistantModalOpen(true);
        }
    };

    const handleConfirmDeleteAssistant = () => {
        if (assistantToDelete) {
            deleteAssistant(assistantToDelete);
            showFeedback(`تم حذف المساعد "${assistantToDelete}" بنجاح.`, 'success');
        }
        setIsDeleteAssistantModalOpen(false);
        setAssistantToDelete(null);
    };
    
    const handleInspectDb = async () => {
        setDbStats('جاري الفحص...');
        let stats = '';
        try {
            const db = await openDB('LawyerAppData', 2);
            
            const storesToCheck = [
                { name: 'appData', label: 'بيانات التطبيق الرئيسية' },
                { name: 'caseDocumentMetadata', label: 'بيانات الوثائق الوصفية' },
                { name: 'caseDocumentFiles', label: 'ملفات الوثائق المحفوظة' }
            ];

            for (const store of storesToCheck) {
                if (db.objectStoreNames.contains(store.name)) {
                    const count = await db.count(store.name);
                    stats += `- ${store.label} (${store.name}): ${count} سجل\n`;
                } else {
                    stats += `- ${store.label} (${store.name}): غير موجود!\n`;
                }
            }
            
            setDbStats(stats.trim());

        } catch (error: any) {
            console.error("Failed to inspect DB:", error);
            setDbStats(`فشل فحص قاعدة البيانات: ${error.message}`);
        }
    };

    const ToggleSwitch: React.FC<{ enabled: boolean; onChange: (enabled: boolean) => void; label: string }> = ({ enabled, onChange, label }) => (
        <div className="flex items-center">
            <span className="text-gray-700 me-3 font-medium">{label}</span>
            <button
                type="button"
                className={`${
                    enabled ? 'bg-blue-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                role="switch"
                aria-checked={enabled}
                onClick={() => onChange(!enabled)}
            >
                <span
                    aria-hidden="true"
                    className={`${
                        enabled ? 'translate-x-5' : 'translate-x-0'
                    } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                />
            </button>
        </div>
    );


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">الإعدادات</h1>
            
            {feedback && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <span>{feedback.message}</span>
                </div>
            )}
            
             <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إعدادات المزامنة</h2>
                 <p className="text-gray-600 text-sm">
                    عند تفعيله، يتم مزامنة البيانات تلقائيًا مع السحابة عند حدوث تغييرات أو عند الاتصال بالإنترنت. عند إيقافه، يجب إجراء المزامنة يدويًا.
                </p>
                <div className="pt-2">
                    <ToggleSwitch 
                        label="المزامنة التلقائية"
                        enabled={isAutoSyncEnabled}
                        onChange={setAutoSyncEnabled}
                    />
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إعدادات النسخ الاحتياطي اليومي</h2>
                <p className="text-gray-600 text-sm">
                    لحماية بياناتك من الضياع العرضي (مثل مسح بيانات المتصفح)، يمكن للتطبيق إنشاء نسخة احتياطية كاملة من بياناتك تلقائياً مرة واحدة يومياً عند أول استخدام. سيقوم متصفحك بتنزيل الملف إلى مجلد التنزيلات الافتراضي لديك، أو قد يسألك عن مكان حفظه حسب إعدادات المتصفح.
                </p>
                <div className="pt-2">
                    <ToggleSwitch 
                        label="النسخ الاحتياطي اليومي التلقائي"
                        enabled={isAutoBackupEnabled}
                        onChange={setAutoBackupEnabled}
                    />
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">تخطيط عرض المهام الإدارية</h2>
                <p className="text-gray-600 text-sm">اختر طريقة عرض مجموعات المهام الإدارية في الصفحة الرئيسية.</p>
                <div className="pt-2 flex items-center gap-4">
                    <button onClick={() => setAdminTasksLayout('horizontal')} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${adminTasksLayout === 'horizontal' ? 'bg-blue-600 text-white shadow' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                        عرض أفقي
                    </button>
                    <button onClick={() => setAdminTasksLayout('vertical')} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${adminTasksLayout === 'vertical' ? 'bg-blue-600 text-white shadow' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                        عرض عمودي
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">فحص البيانات المحلية</h2>
                <p className="text-gray-600 text-sm">
                    استخدم هذا الزر للتحقق من حالة قاعدة البيانات المحلية على هذا الجهاز. يعرض عدد السجلات في كل جدول بيانات.
                </p>
                <button onClick={handleInspectDb} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                    <ShieldCheckIcon className="w-5 h-5" />
                    <span>فحص قاعدة البيانات المحلية</span>
                </button>
                {dbStats && (
                    <div className="mt-4 p-4 bg-gray-100 rounded-md">
                        <h3 className="font-semibold text-gray-800">نتائج الفحص:</h3>
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap">{dbStats}</pre>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">حفظ ونقل البيانات</h2>
                <p className="text-gray-600 text-sm">
                    يتم حفظ جميع بياناتك بشكل آمن وتلقائي على هذا الجهاز. للعمل على جهاز آخر، يمكنك استخدام أدوات التصدير والاستيراد لنقل نسخة من بياناتك.
                </p>
                <div className="flex flex-col md:flex-row gap-6 pt-4 border-t">
                    <div className="flex-1 space-y-2">
                        <h3 className="font-semibold text-lg">تصدير البيانات</h3>
                        <p className="text-gray-600 text-sm">
                            احفظ نسخة احتياطية من جميع بياناتك في ملف واحد. يمكنك استخدام هذا الملف لاستعادة بياناتك أو نقلها إلى جهاز آخر.
                        </p>
                        <button onClick={handleExportData} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                           <ArrowDownTrayIcon className="w-5 h-5" />
                           <span>تصدير البيانات الآن</span>
                        </button>
                    </div>
                    <div className="flex-1 space-y-2">
                        <h3 className="font-semibold text-lg">استيراد البيانات</h3>
                        <p className="text-gray-600 text-sm">
                           استورد بيانات من ملف تصدير. <strong className="text-red-600">تحذير:</strong> سيؤدي هذا إلى استبدال جميع البيانات الحالية.
                        </p>
                        <input type="file" id="import-file" className="hidden" onChange={handleImportData} accept=".json"/>
                        <label htmlFor="import-file" className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
                            <ArrowUpTrayIcon className="w-5 h-5" />
                            <span>اختر ملف للاستيراد</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إدارة المساعدين</h2>
                <div className="space-y-4">
                    <div>
                        <form onSubmit={handleAddAssistant} className="mt-1 flex gap-2">
                             <input 
                                type="text" 
                                id="new-assistant"
                                value={newAssistant}
                                onChange={(e) => setNewAssistant(e.target.value)}
                                className="flex-grow p-2 border border-gray-300 rounded-lg"
                                placeholder="اسم المساعد الجديد"
                                aria-label="اسم المساعد الجديد"
                            />
                            <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                                <PlusIcon className="w-5 h-5"/>
                                <span>إضافة</span>
                            </button>
                        </form>
                    </div>
                    <div>
                        <h3 className="text-lg font-medium text-gray-800">قائمة المساعدين</h3>
                        <ul className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                            {assistants.map(assistant => (
                                <li key={assistant} className="flex justify-between items-center p-3 bg-gray-50 rounded-md border">
                                    <span className="font-medium">{assistant}</span>
                                    {assistant !== 'بدون تخصيص' && (
                                        <button onClick={() => handleDeleteAssistant(assistant)} className="p-1 text-red-500 rounded-full hover:bg-red-100" aria-label={`حذف ${assistant}`}>
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow space-y-6">
                <h2 className="text-xl font-bold text-gray-800 border-b pb-3">إدارة البيانات الخطرة</h2>
                <div className="p-4 bg-red-50 border-s-4 border-red-500 rounded-md">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
                        </div>
                        <div className="ms-3">
                            <h3 className="text-lg font-semibold text-red-800">مسح جميع البيانات</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p>هذا الإجراء سيقوم بحذف جميع البيانات المخزنة في التطبيق بشكل نهائي على هذا الجهاز. لا يمكن التراجع عن هذا الإجراء.</p>
                            </div>
                             <div className="mt-4">
                                 <button onClick={() => setIsConfirmModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
                                    <TrashIcon className="w-5 h-5" />
                                    <span>أفهم المخاطر، قم بالمسح الآن</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isConfirmModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => setIsConfirmModalOpen(false)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900" id="modal-title">
                                تأكيد الحذف
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من رغبتك في حذف جميع بيانات التطبيق؟ <br />
                                هذا الإجراء نهائي ولا يمكن التراجع عنه.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={() => setIsConfirmModalOpen(false)}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmClearData}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteAssistantModalOpen && assistantToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => { setIsDeleteAssistantModalOpen(false); setAssistantToDelete(null); }}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                تأكيد حذف المساعد
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من رغبتك في حذف المساعد "{assistantToDelete}"؟<br />
                                سيتم إزالة هذا المساعد من قائمة التخصيص.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={() => { setIsDeleteAssistantModalOpen(false); setAssistantToDelete(null); }}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmDeleteAssistant}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPage;