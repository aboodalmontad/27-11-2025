import * as React from 'react';
import { AccountingEntry, Client, Invoice, InvoiceItem, Case, Stage, Session } from '../types';
import { formatDate, toInputDateString, parseInputDateString } from '../utils/dateUtils';
import { PlusIcon, PencilIcon, TrashIcon, SearchIcon, ExclamationTriangleIcon, PrintIcon } from '../components/icons';
import { useData } from '../context/DataContext';
import PrintableInvoice from '../components/PrintableInvoice';
import { printElement } from '../utils/printUtils';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// --- TAB: ENTRIES ---
const EntriesTab: React.FC = () => {
    const { accountingEntries, setAccountingEntries, clients, deleteAccountingEntry } = useData();
    const [modal, setModal] = React.useState<{ isOpen: boolean; data?: AccountingEntry }>({ isOpen: false });
    const [formData, setFormData] = React.useState<Partial<AccountingEntry>>({});
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [entryToDelete, setEntryToDelete] = React.useState<AccountingEntry | null>(null);

    const financialSummary = React.useMemo(() => {
        const totalIncome = accountingEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
        const totalExpenses = accountingEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
        return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses };
    }, [accountingEntries]);

    const filteredAndSortedEntries = React.useMemo(() => {
        const filtered = accountingEntries.filter(entry => {
            if (!searchQuery) return true;
            const lowercasedQuery = searchQuery.toLowerCase();
            return (
                entry.description.toLowerCase().includes(lowercasedQuery) ||
                entry.clientName.toLowerCase().includes(lowercasedQuery) ||
                entry.amount.toString().includes(searchQuery)
            );
        });
        return filtered.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [accountingEntries, searchQuery]);

    const handleOpenModal = (entry?: AccountingEntry) => {
        setFormData(entry ? { ...entry, date: entry.date.toISOString().split('T')[0] as any } : { type: 'income', date: new Date().toISOString().split('T')[0] as any });
        setModal({ isOpen: true, data: entry });
    };
    const handleCloseModal = () => setModal({ isOpen: false });
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) : value }));
    };
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsedDate = parseInputDateString(formData.date as string);
        if (!parsedDate) {
            alert("التاريخ غير صالح.");
            return;
        }
        const selectedClient = clients.flatMap(c => c.cases.map(cs => ({ ...cs, clientId: c.id, clientName: c.name }))).find(c => c.id === formData.caseId);
        const entryData = { ...formData, date: parsedDate, clientName: selectedClient?.clientName || 'مصاريف عامة', clientId: selectedClient?.clientId || '', updated_at: new Date() } as Omit<AccountingEntry, 'id'>;
        if (modal.data) {
            setAccountingEntries(prev => prev.map(item => item.id === modal.data!.id ? { ...item, ...entryData } as AccountingEntry : item));
        } else {
            setAccountingEntries(prev => [...prev, { ...entryData, id: `acc-${Date.now()}` } as AccountingEntry]);
        }
        handleCloseModal();
    };
    const openDeleteModal = (entry: AccountingEntry) => {
        setEntryToDelete(entry);
        setIsDeleteModalOpen(true);
    };
    const closeDeleteModal = () => setIsDeleteModalOpen(false);
    const handleConfirmDelete = () => {
        if (entryToDelete) deleteAccountingEntry(entryToDelete.id);
        closeDeleteModal();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold text-gray-800">القيود المالية</h2>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-grow"><input type="search" placeholder="ابحث في القيود..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500" /><div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none"><SearchIcon className="w-4 h-4 text-gray-500" /></div></div>
                    <button onClick={() => handleOpenModal()} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"><PlusIcon className="w-5 h-5" /><span>إضافة قيد</span></button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="p-6 bg-green-100 text-green-800 rounded-lg shadow"><h3 className="text-lg font-semibold">إجمالي الإيرادات</h3><p className="text-3xl font-bold">{financialSummary.totalIncome.toLocaleString()} ل.س</p></div><div className="p-6 bg-red-100 text-red-800 rounded-lg shadow"><h3 className="text-lg font-semibold">إجمالي المصروفات</h3><p className="text-3xl font-bold">{financialSummary.totalExpenses.toLocaleString()} ل.س</p></div><div className="p-6 bg-blue-100 text-blue-800 rounded-lg shadow"><h3 className="text-lg font-semibold">الرصيد</h3><p className="text-3xl font-bold">{financialSummary.balance.toLocaleString()} ل.س</p></div></div>
            <div className="overflow-x-auto"><table className="w-full text-sm text-right text-gray-600"><thead className="text-xs text-gray-700 uppercase bg-gray-100"><tr><th className="px-6 py-3">التاريخ</th><th className="px-6 py-3">البيان</th><th className="px-6 py-3">العميل/القضية</th><th className="px-6 py-3">الواردات</th><th className="px-6 py-3">المصروفات</th><th className="px-6 py-3">إجراءات</th></tr></thead><tbody>{filteredAndSortedEntries.map(entry => (<tr key={entry.id} className="bg-white border-b hover:bg-gray-50"><td className="px-6 py-4">{formatDate(entry.date)}</td><td className="px-6 py-4">{entry.description}</td><td className="px-6 py-4">{entry.clientName}</td><td className="px-6 py-4 font-semibold text-green-600">{entry.type === 'income' ? entry.amount.toLocaleString() : '-'}</td><td className="px-6 py-4 font-semibold text-red-600">{entry.type === 'expense' ? entry.amount.toLocaleString() : '-'}</td><td className="px-6 py-4 flex items-center gap-2"><button onClick={() => handleOpenModal(entry)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button><button onClick={() => openDeleteModal(entry)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button></td></tr>))}</tbody></table></div>
            {modal.isOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseModal}><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}><h2 className="text-xl font-bold mb-4">{modal.data ? 'تعديل قيد' : 'إضافة قيد جديد'}</h2><form onSubmit={handleSubmit} className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700">النوع</label><select name="type" value={formData.type || 'income'} onChange={handleFormChange} className="w-full p-2 border rounded" required><option value="income">إيرادات</option><option value="expense">مصروفات</option></select></div><div><label className="block text-sm font-medium text-gray-700">التاريخ</label><input type="date" name="date" value={formData.date as any} onChange={handleFormChange} className="w-full p-2 border rounded" placeholder="DD/MM/YYYY" required /></div></div><div><label className="block text-sm font-medium text-gray-700">القضية (اختياري)</label><select name="caseId" value={formData.caseId || ''} onChange={handleFormChange} className="w-full p-2 border rounded"><option value="">-- مصروفات عامة --</option>{clients.flatMap(c => c.cases.map(cs => <option key={cs.id} value={cs.id}>{c.name} - {cs.subject}</option>))}</select></div><div><label className="block text-sm font-medium text-gray-700">البيان</label><input type="text" name="description" value={formData.description || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div><div><label className="block text-sm font-medium text-gray-700">المبلغ</label><input type="number" name="amount" value={formData.amount || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div><div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ</button></div></form></div></div>)}
            {isDeleteModalOpen && entryToDelete && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={closeDeleteModal}><div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}><div className="text-center"><div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" /></div><h3 className="text-2xl font-bold text-gray-900">تأكيد حذف القيد</h3><p className="text-gray-600 my-4">هل أنت متأكد من حذف قيد "{entryToDelete.description}"؟<br /> هذا الإجراء لا يمكن التراجع عنه.</p></div><div className="mt-6 flex justify-center gap-4"><button type="button" className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors" onClick={closeDeleteModal}>إلغاء</button><button type="button" className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors" onClick={handleConfirmDelete}>نعم، قم بالحذف</button></div></div></div>)}
        </div>
    );
};

// --- TAB: INVOICES ---
interface InvoicesTabProps {
    initialInvoiceData?: { clientId: string; caseId?: string };
    clearInitialInvoiceData: () => void;
}
const getStatusStyles = (status: Invoice['status']) => {
    switch (status) {
        case 'draft': return { text: 'مسودة', className: 'bg-gray-200 text-gray-800' };
        case 'sent': return { text: 'مرسلة', className: 'bg-blue-200 text-blue-800' };
        case 'paid': return { text: 'مدفوعة', className: 'bg-green-200 text-green-800' };
        case 'overdue': return { text: 'متأخرة', className: 'bg-red-200 text-red-800' };
    }
};
const InvoicesTab: React.FC<InvoicesTabProps> = ({ initialInvoiceData, clearInitialInvoiceData }) => {
    const { invoices, setInvoices, clients, deleteInvoice } = useData();
    const [modal, setModal] = React.useState<{ isOpen: boolean; data?: Invoice }>({ isOpen: false });
    const [formData, setFormData] = React.useState<Partial<Invoice> & { items: InvoiceItem[] }>({ items: [] });
    const [searchQuery, setSearchQuery] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<Invoice['status'] | 'all'>('all');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [entryToDelete, setEntryToDelete] = React.useState<Invoice | null>(null);
    const [viewInvoice, setViewInvoice] = React.useState<Invoice | null>(null);
    const printInvoiceRef = React.useRef<HTMLDivElement>(null);
    
    React.useEffect(() => {
        if (initialInvoiceData) {
            handleOpenModal(undefined, initialInvoiceData);
            clearInitialInvoiceData();
        }
    }, [initialInvoiceData]);

    const filteredAndSortedInvoices = React.useMemo(() => invoices.filter(invoice => (statusFilter === 'all' || invoice.status === statusFilter) && (searchQuery === '' || invoice.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || invoice.id.toLowerCase().includes(searchQuery.toLowerCase()))).sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime()), [invoices, searchQuery, statusFilter]);
    const handleOpenModal = (invoice?: Invoice, initialIds?: { clientId: string; caseId?: string }) => {
        const today = new Date(); const dueDate = new Date(today); dueDate.setDate(today.getDate() + 14);
        const client = clients.find(c => c.id === initialIds?.clientId);
        const caseItem = client?.cases.find(c => c.id === initialIds?.caseId);
        const newFormData = invoice ? { ...invoice, issueDate: toInputDateString(invoice.issueDate) as any, dueDate: toInputDateString(invoice.dueDate) as any } : { id: `INV-${Date.now()}`, issueDate: toInputDateString(today) as any, dueDate: toInputDateString(dueDate) as any, clientId: client?.id || '', caseId: caseItem?.id || '', items: [{ id: `item-${Date.now()}`, description: '', amount: 0, updated_at: new Date() }], taxRate: 0, discount: 0, status: 'draft' as 'draft' };
        setFormData(newFormData as any);
        setModal({ isOpen: true, data: invoice });
    };
    const handleCloseModal = () => setModal({ isOpen: false });
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { const { name, value } = e.target; const numValue = (name === 'taxRate' || name === 'discount') ? parseFloat(value) : value; setFormData(prev => ({ ...prev, [name]: numValue })); };
    const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => { const newItems = [...formData.items]; const updatedItem = { ...newItems[index], updated_at: new Date() }; (updatedItem as any)[field] = field === 'amount' ? parseFloat(value as string) || 0 : value; newItems[index] = updatedItem; setFormData(prev => ({ ...prev, items: newItems })); };
    const handleAddItem = () => setFormData(prev => ({ ...prev, items: [...prev.items, { id: `item-${Date.now()}`, description: '', amount: 0, updated_at: new Date() }] }));
    const handleRemoveItem = (index: number) => setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const client = clients.find(c => c.id === formData.clientId); if (!client) return;
        const caseItem = client.cases.find(c => c.id === formData.caseId);

        const parsedIssueDate = parseInputDateString(formData.issueDate as string);
        const parsedDueDate = parseInputDateString(formData.dueDate as string);
        if (!parsedIssueDate || !parsedDueDate) {
            alert("التواريخ المحددة غير صالحة.");
            return;
        }

        const finalInvoice: Invoice = { id: formData.id!, clientId: client.id, clientName: client.name, caseId: caseItem?.id, caseSubject: caseItem?.subject, issueDate: parsedIssueDate, dueDate: parsedDueDate, items: formData.items.filter(item => item.description.trim() !== '' && item.amount > 0), taxRate: formData.taxRate || 0, discount: formData.discount || 0, status: formData.status!, notes: formData.notes, updated_at: new Date() };
        if (modal.data) { setInvoices(prev => prev.map(inv => inv.id === modal.data!.id ? finalInvoice : inv)); } else { setInvoices(prev => [...prev, finalInvoice]); }
        handleCloseModal();
    };
    const openDeleteModal = (invoice: Invoice) => { setEntryToDelete(invoice); setIsDeleteModalOpen(true); };
    const handleConfirmDelete = () => { if (entryToDelete) deleteInvoice(entryToDelete.id); setIsDeleteModalOpen(false); setEntryToDelete(null); };
    const subtotal = formData.items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
    const taxAmount = (subtotal * (formData.taxRate || 0)) / 100;
    const total = subtotal + taxAmount - (formData.discount || 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><h2 className="text-2xl font-bold text-gray-800">الفواتير</h2><button onClick={() => handleOpenModal()} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"><PlusIcon className="w-5 h-5" /><span>إنشاء فاتورة</span></button></div>
            <div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="relative md:col-span-2"><input type="search" placeholder="ابحث بالموكل أو رقم الفاتورة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50" /><div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none"><SearchIcon className="w-4 h-4 text-gray-500" /></div></div><div><select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full p-2 text-sm border border-gray-300 rounded-lg bg-gray-50"><option value="all">كل الحالات</option><option value="draft">مسودة</option><option value="sent">مرسلة</option><option value="paid">مدفوعة</option><option value="overdue">متأخرة</option></select></div></div><div className="overflow-x-auto"><table className="w-full text-sm text-right text-gray-600"><thead className="text-xs text-gray-700 uppercase bg-gray-100"><tr><th className="px-6 py-3">رقم الفاتورة</th><th className="px-6 py-3">العميل</th><th className="px-6 py-3">تاريخ الإصدار</th><th className="px-6 py-3">تاريخ الاستحقاق</th><th className="px-6 py-3">الإجمالي</th><th className="px-6 py-3">الحالة</th><th className="px-6 py-3">إجراءات</th></tr></thead><tbody>{filteredAndSortedInvoices.map(invoice => (<tr key={invoice.id} className="bg-white border-b hover:bg-gray-50 cursor-pointer" onClick={() => setViewInvoice(invoice)}><td className="px-6 py-4 font-mono">{invoice.id}</td><td className="px-6 py-4">{invoice.clientName}</td><td className="px-6 py-4">{formatDate(invoice.issueDate)}</td><td className="px-6 py-4">{formatDate(invoice.dueDate)}</td><td className="px-6 py-4 font-semibold">{(invoice.items.reduce((s, i) => s + i.amount, 0) * (1 + invoice.taxRate / 100) - invoice.discount).toLocaleString()} ل.س</td><td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyles(invoice.status).className}`}>{getStatusStyles(invoice.status).text}</span></td><td className="px-6 py-4" onClick={e => e.stopPropagation()}><div className="flex items-center gap-2"><button onClick={() => setViewInvoice(invoice)} className="p-2 text-gray-500 hover:text-green-600" title="طباعة/عرض"><PrintIcon className="w-4 h-4" /></button><button onClick={() => handleOpenModal(invoice)} className="p-2 text-gray-500 hover:text-blue-600" title="تعديل"><PencilIcon className="w-4 h-4" /></button><button onClick={() => openDeleteModal(invoice)} className="p-2 text-gray-500 hover:text-red-600" title="حذف"><TrashIcon className="w-4 h-4" /></button></div></td></tr>))}</tbody></table></div></div>
            {modal.isOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseModal}><div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-3xl" onClick={e => e.stopPropagation()}><h2 className="text-xl font-bold mb-4">{modal.data ? 'تعديل فاتورة' : 'فاتورة جديدة'}</h2><form onSubmit={handleSubmit} className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div><label className="block text-sm font-medium">العميل</label><select name="clientId" value={formData.clientId || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="block text-sm font-medium">القضية (اختياري)</label><select name="caseId" value={formData.caseId || ''} onChange={handleFormChange} className="w-full p-2 border rounded" disabled={!formData.clientId}><option value="">--</option>{clients.find(c => c.id === formData.clientId)?.cases.map(cs => <option key={cs.id} value={cs.id}>{cs.subject}</option>)}</select></div><div><label className="block text-sm font-medium">تاريخ الإصدار</label><input type="date" name="issueDate" value={formData.issueDate as any} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div><div><label className="block text-sm font-medium">تاريخ الاستحقاق</label><input type="date" name="dueDate" value={formData.dueDate as any} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div></div><div className="border-t pt-4">{formData.items.map((item, index) => (<div key={item.id} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2"><input type="text" placeholder="البيان" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="w-full p-2 border rounded" /><input type="number" placeholder="المبلغ" value={item.amount} onChange={e => handleItemChange(index, 'amount', e.target.value)} className="w-full sm:w-48 p-2 border rounded" /><button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full self-end sm:self-center"><TrashIcon className="w-5 h-5" /></button></div>))}<button type="button" onClick={handleAddItem} className="text-sm text-blue-600 font-semibold">+ إضافة بند</button></div><div className="flex flex-col md:flex-row gap-4 pt-4 border-t"><div className="flex-grow space-y-4"><div><label className="block text-sm font-medium">ملاحظات</label><textarea name="notes" value={formData.notes || ''} onChange={handleFormChange} className="w-full p-2 border rounded" rows={4}></textarea></div><div><label className="block text-sm font-medium">الحالة</label><select name="status" value={formData.status || 'draft'} onChange={handleFormChange} className="w-full p-2 border rounded"><option value="draft">مسودة</option><option value="sent">مرسلة</option><option value="paid">مدفوعة</option><option value="overdue">متأخرة</option></select></div></div><div className="w-full md:w-64 flex-shrink-0 space-y-2"><div className="flex justify-between items-center"><label>المجموع الفرعي</label><span>{subtotal.toLocaleString()}</span></div><div className="flex justify-between items-center"><label>الضريبة (%)</label><input type="number" name="taxRate" value={formData.taxRate || 0} onChange={handleFormChange} className="w-20 p-1 border rounded text-left" /></div><div className="flex justify-between items-center"><label>الخصم</label><input type="number" name="discount" value={formData.discount || 0} onChange={handleFormChange} className="w-20 p-1 border rounded text-left" /></div><div className="flex justify-between items-center font-bold text-lg pt-2 border-t"><label>الإجمالي</label><span>{total.toLocaleString()}</span></div></div></div><div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div></form></div></div>)}
            {isDeleteModalOpen && entryToDelete && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => setIsDeleteModalOpen(false)}><div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}><div className="text-center"><div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div><h3 className="text-2xl font-bold text-gray-900">تأكيد حذف الفاتورة</h3><p className="text-gray-600 my-4">هل أنت متأكد من حذف الفاتورة رقم <strong className="font-mono">{entryToDelete.id}</strong>؟ لا يمكن التراجع عن هذا الإجراء.</p></div><div className="mt-6 flex justify-center gap-4"><button type="button" className="px-6 py-2 bg-gray-200" onClick={() => setIsDeleteModalOpen(false)}>إلغاء</button><button type="button" className="px-6 py-2 bg-red-600 text-white" onClick={handleConfirmDelete}>نعم، قم بالحذف</button></div></div></div>)}
            {viewInvoice && (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] no-print" onClick={() => setViewInvoice(null)}><div className="bg-white p-2 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}><div className="overflow-y-auto" ref={printInvoiceRef}><PrintableInvoice invoice={viewInvoice} /></div><div className="mt-4 flex justify-end gap-4 border-t p-4"><button type="button" onClick={() => setViewInvoice(null)} className="px-6 py-2 bg-gray-200 rounded-lg">إغلاق</button><button type="button" onClick={() => printElement(printInvoiceRef.current)} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg"><PrintIcon className="w-5 h-5" />طباعة</button></div></div></div>)}
        </div>
    );
};

// --- TAB: REPORTS ---
const CustomTooltip = ({ active, payload, label, formatter }: any) => {
    if (active && payload && payload.length) return <div className="bg-white p-2 border shadow-lg rounded-md"><p className="font-bold">{label}</p><p className="text-sm">{`${payload[0].name}: ${formatter ? formatter(payload[0].value) : payload[0].value.toLocaleString()}`}</p></div>;
    return null;
};
const ReportsTab: React.FC = () => {
    const { clients, accountingEntries } = useData();
    const today = new Date(); const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(today.getDate() - 30);
    const [reportType, setReportType] = React.useState<'financial' | 'cases' | 'clients' | 'analytics' | ''>('');
    const [filters, setFilters] = React.useState({ startDate: toInputDateString(thirtyDaysAgo), endDate: toInputDateString(today), clientId: 'all' });
    const [reportData, setReportData] = React.useState<any>(null);
    const printReportsRef = React.useRef<HTMLDivElement>(null);
    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters({ ...filters, [e.target.name]: e.target.value });
    const handleGenerateReport = () => {
        if (!reportType) { alert('يرجى اختيار نوع التقرير.'); return; }
        const startDate = new Date(filters.startDate); startDate.setHours(0, 0, 0, 0); const endDate = new Date(filters.endDate); endDate.setHours(23, 59, 59, 999);
        if (reportType === 'financial') generateFinancialReport(startDate, endDate);
        else if (reportType === 'cases') generateCaseStatusReport();
        else if (reportType === 'clients') generateClientActivityReport();
        else if (reportType === 'analytics') generateAnalyticsReport();
    };
    const generateFinancialReport = (startDate: Date, endDate: Date) => { const filteredEntries = accountingEntries.filter(entry => { const entryDate = new Date(entry.date); const inDateRange = entryDate >= startDate && entryDate <= endDate; const clientMatch = filters.clientId === 'all' || entry.clientId === filters.clientId; return inDateRange && clientMatch; }); const totals = filteredEntries.reduce((acc, entry) => { if (entry.type === 'income') acc.income += entry.amount; else acc.expense += entry.amount; return acc; }, { income: 0, expense: 0 }); setReportData({ type: 'financial', totals: { ...totals, balance: totals.income - totals.expense }, entries: filteredEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), title: `ملخص مالي ${filters.clientId !== 'all' ? `للموكل: ${clients.find(c => c.id === filters.clientId)?.name}` : ''} من ${formatDate(startDate)} إلى ${formatDate(endDate)}` }); };
    const generateCaseStatusReport = () => { const allCases = clients.flatMap(client => client.cases.map(c => ({ ...c, clientName: client.name, clientId: client.id }))); const filteredCases = filters.clientId === 'all' ? allCases : allCases.filter(c => c.clientId === filters.clientId); const caseCounts = filteredCases.reduce((acc, caseItem) => { acc[caseItem.status] = (acc[caseItem.status] || 0) + 1; return acc; }, {} as Record<Case['status'], number>); const statusMap: Record<Case['status'], string> = { active: 'نشطة', closed: 'مغلقة', on_hold: 'معلقة' }; setReportData({ type: 'cases', cases: filteredCases, pieData: Object.entries(caseCounts).map(([status, value]) => ({ name: statusMap[status as Case['status']], value })), title: `تقرير حالة القضايا ${filters.clientId !== 'all' ? `للموكل: ${clients.find(c => c.id === filters.clientId)?.name}` : ''}` }); };
    const generateClientActivityReport = () => { if (filters.clientId === 'all') { setReportData(null); alert('يرجى اختيار موكل لعرض تقرير النشاط.'); return; } const client = clients.find(c => c.id === filters.clientId); if (!client) return; const clientEntries = accountingEntries.filter(e => e.clientId === client.id); const totals = clientEntries.reduce((acc, entry) => { if (entry.type === 'income') acc.income += entry.amount; else acc.expense += entry.amount; return acc; }, { income: 0, expense: 0 }); setReportData({ type: 'clients', client, cases: client.cases, entries: clientEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), totals: { ...totals, balance: totals.income - totals.expense }, title: `تقرير نشاط الموكل: ${client.name}` }); };
    const generateAnalyticsReport = () => { const topClientsByCases = [...clients].map(c => ({ name: c.name, value: c.cases.length })).filter(c => c.value > 0).sort((a, b) => b.value - a.value).slice(0, 7); const incomeByClient = accountingEntries.filter(e => e.type === 'income' && e.clientId).reduce((acc, entry) => { acc[entry.clientId] = (acc[entry.clientId] || 0) + entry.amount; return acc; }, {} as Record<string, number>); const topClientsByIncomeData = Object.entries(incomeByClient).map(([clientId, income]): { name: string; value: number } => ({ name: clients.find(c => c.id === clientId)?.name || 'غير معروف', value: income as number })).sort((a, b) => b.value - a.value); const topClientsByIncome = topClientsByIncomeData.slice(0, 5); if (topClientsByIncomeData.length > 5) { const othersIncome = topClientsByIncomeData.slice(5).reduce((acc, curr) => acc + curr.value, 0); topClientsByIncome.push({ name: 'آخرون', value: othersIncome }); } const allCases = clients.flatMap(c => c.cases); const incomeByCase = accountingEntries.filter(e => e.type === 'income' && e.caseId).reduce((acc, entry) => { acc[entry.caseId] = (acc[entry.caseId] || 0) + entry.amount; return acc; }, {} as Record<string, number>); const topCasesByIncome = Object.entries(incomeByCase).map(([caseId, income]) => { const caseInfo = allCases.find(c => c.id === caseId); const name = caseInfo ? `${caseInfo.clientName} - ${caseInfo.subject}` : 'قضية محذوفة'; return { name: name.length > 40 ? name.slice(0, 37) + '...' : name, value: income as number }; }).sort((a, b) => b.value - a.value).slice(0, 10); const closedCasesWithDurations = allCases.filter(c => c.status === 'closed').map((c): { name: string; value: number } | null => { const sessions = c.stages.flatMap((stage: Stage): Session[] => stage.sessions); if (sessions.length < 2) return null; const timestamps = sessions.map((session: Session) => new Date(session.date).getTime()).filter((t): t is number => !isNaN(t)); if (timestamps.length < 2) return null; const minDate = Math.min(...timestamps); const maxDate = Math.max(...timestamps); const duration = Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1; return { name: c.subject, value: duration }; }).filter((item): item is { name: string; value: number } => Boolean(item)); const longestCases = [...closedCasesWithDurations].sort((a, b) => b.value - a.value).slice(0, 10); setReportData({ type: 'analytics', data: { topClientsByCases, topClientsByIncome, topCasesByIncome, longestCases, }, title: 'تحليلات شاملة لأداء المكتب' }); };
    const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];
    const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

    return (
        <div className="space-y-6">
            <div className="space-y-4 no-print"><h2 className="text-2xl font-semibold border-b pb-2">خيارات التقرير</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end"><div><label className="block text-sm font-medium text-gray-700">نوع التقرير</label><select name="reportType" value={reportType} onChange={(e) => setReportType(e.target.value as any)} className="w-full p-2 border rounded-md"><option value="">-- اختر نوع التقرير --</option><option value="financial">تقرير مالي</option><option value="cases">تقرير حالة القضايا</option><option value="clients">تقرير نشاط موكل</option><option value="analytics">تحليلات شاملة</option></select></div>{(reportType === 'financial' || reportType === 'cases' || reportType === 'clients') && <div><label className="block text-sm font-medium text-gray-700">الموكل</label><select name="clientId" value={filters.clientId} onChange={handleFilterChange} className="w-full p-2 border rounded-md"><option value="all">جميع الموكلين</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}{reportType === 'financial' && <><div><label className="block text-sm font-medium text-gray-700">من تاريخ</label><input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="w-full p-2 border rounded-md" /></div><div><label className="block text-sm font-medium text-gray-700">إلى تاريخ</label><input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="w-full p-2 border rounded-md" /></div></>}<div className="lg:col-span-4 flex justify-end"><button onClick={handleGenerateReport} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">عرض التقرير</button></div></div></div>
             {reportData && (
                <div ref={printReportsRef}>
                    <div className="flex justify-between items-center border-b pb-4 mb-6">
                        <h2 className="text-2xl font-bold">{reportData.title}</h2>
                        <button onClick={() => printElement(printReportsRef.current)} className="no-print flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">
                            <PrintIcon className="w-5 h-5" />
                            <span>طباعة</span>
                        </button>
                    </div>
                    {reportData.type === 'financial' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-green-100 text-green-800 rounded-lg"><h4 className="font-semibold">إجمالي الإيرادات</h4><p className="text-2xl font-bold">{reportData.totals.income.toLocaleString()} ل.س</p></div>
                                <div className="p-4 bg-red-100 text-red-800 rounded-lg"><h4 className="font-semibold">إجمالي المصروفات</h4><p className="text-2xl font-bold">{reportData.totals.expense.toLocaleString()} ل.س</p></div>
                                <div className="p-4 bg-blue-100 text-blue-800 rounded-lg"><h4 className="font-semibold">الرصيد</h4><p className="text-2xl font-bold">{reportData.totals.balance.toLocaleString()} ل.س</p></div>
                            </div>
                            <table className="w-full text-sm text-right">
                                <thead className="bg-gray-100"><tr><th className="px-4 py-2">التاريخ</th><th className="px-4 py-2">البيان</th><th className="px-4 py-2">العميل/القضية</th><th className="px-4 py-2">الواردات</th><th className="px-4 py-2">المصروفات</th></tr></thead>
                                <tbody>{reportData.entries.map((e: AccountingEntry) => (<tr key={e.id} className="border-t"><td className="px-4 py-2">{formatDate(new Date(e.date))}</td><td className="px-4 py-2">{e.description}</td><td className="px-4 py-2">{e.clientName}</td><td className="px-4 py-2 text-green-600">{e.type === 'income' ? e.amount.toLocaleString() : '-'}</td><td className="px-4 py-2 text-red-600">{e.type === 'expense' ? e.amount.toLocaleString() : '-'}</td></tr>))}</tbody>
                            </table>
                        </div>
                    )}
                    {reportData.type === 'cases' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={reportData.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} fill="#8884d8" label>{reportData.pieData.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip content={<CustomTooltip />} /><Legend /></PieChart></ResponsiveContainer></div>
                            <table className="w-full text-sm text-right"><thead className="bg-gray-100"><tr><th className="px-4 py-2">القضية</th><th className="px-4 py-2">الموكل</th><th className="px-4 py-2">الحالة</th></tr></thead><tbody>{reportData.cases.map((c: any) => <tr key={c.id} className="border-t"><td className="px-4 py-2">{c.subject}</td><td className="px-4 py-2">{c.clientName}</td><td className="px-4 py-2">{c.status}</td></tr>)}</tbody></table>
                        </div>
                    )}
                    {reportData.type === 'clients' && (
                         <div className="space-y-4">
                            <div><h3 className="font-bold">القضايا:</h3>{reportData.cases.map((c: Case) => <p key={c.id}>- {c.subject} ({c.status})</p>)}</div>
                            <div><h3 className="font-bold">الملخص المالي:</h3><p>الإيرادات: {reportData.totals.income.toLocaleString()} | المصروفات: {reportData.totals.expense.toLocaleString()} | الرصيد: {reportData.totals.balance.toLocaleString()}</p></div>
                            <table className="w-full text-sm text-right"><thead className="bg-gray-100"><tr><th className="px-4 py-2">التاريخ</th><th className="px-4 py-2">البيان</th><th className="px-4 py-2">الواردات</th><th className="px-4 py-2">المصروفات</th></tr></thead><tbody>{reportData.entries.map((e: AccountingEntry) => <tr key={e.id} className="border-t"><td className="px-4 py-2">{formatDate(new Date(e.date))}</td><td className="px-4 py-2">{e.description}</td><td className="px-4 py-2 text-green-600">{e.type === 'income' ? e.amount.toLocaleString() : '-'}</td><td className="px-4 py-2 text-red-600">{e.type === 'expense' ? e.amount.toLocaleString() : '-'}</td></tr>)}</tbody></table>
                        </div>
                    )}
                    {reportData.type === 'analytics' && (
                        <div className="space-y-12">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div><h3 className="font-bold mb-4 text-center">أكثر الموكلين من حيث عدد القضايا</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={reportData.data.topClientsByCases} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={60} /><Tooltip content={<CustomTooltip />} /><Bar dataKey="value" name="عدد القضايا">{reportData.data.topClientsByCases.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
                                <div><h3 className="font-bold mb-4 text-center">أكثر الموكلين تحقيقاً للدخل</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={reportData.data.topClientsByIncome} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{reportData.data.topClientsByIncome.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}</Pie><Tooltip content={<CustomTooltip />} /><Legend /></PieChart></ResponsiveContainer></div></div>
                            </div>
                            <div><h3 className="font-bold mb-4 text-center">أكثر القضايا تحقيقاً للدخل (أعلى 10)</h3><div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={reportData.data.topCasesByIncome} margin={{ top: 5, right: 20, left: 20, bottom: 120 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={100} /><YAxis /><Tooltip content={<CustomTooltip />} /><Bar dataKey="value" name="الدخل">{reportData.data.topCasesByIncome.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
                            <div><h3 className="font-bold mb-4 text-center">أطول القضايا مدة (بالأيام، أعلى 10)</h3><div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={reportData.data.longestCases} margin={{ top: 5, right: 20, left: 20, bottom: 120 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} height={100} /><YAxis /><Tooltip content={<CustomTooltip />} /><Bar dataKey="value" name="المدة (أيام)">{reportData.data.longestCases.map((_entry: any, index: number) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div></div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


// --- MAIN PAGE COMPONENT ---
interface AccountingPageProps {
    initialInvoiceData?: { clientId: string; caseId?: string };
    clearInitialInvoiceData: () => void;
}

const AccountingPage: React.FC<AccountingPageProps> = ({ initialInvoiceData, clearInitialInvoiceData }) => {
    const [activeTab, setActiveTab] = React.useState<'entries' | 'invoices' | 'reports'>('entries');

    React.useEffect(() => {
        if (initialInvoiceData) {
            setActiveTab('invoices');
        }
    }, [initialInvoiceData]);
    
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">المحاسبة</h1>
            <div className="bg-white rounded-lg shadow">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
                        <button onClick={() => setActiveTab('entries')} className={`${activeTab === 'entries' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>القيود المالية</button>
                        <button onClick={() => setActiveTab('invoices')} className={`${activeTab === 'invoices' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>الفواتير</button>
                        <button onClick={() => setActiveTab('reports')} className={`${activeTab === 'reports' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>التقارير</button>
                    </nav>
                </div>
                <div className="p-0 sm:p-6">
                    {activeTab === 'entries' && <EntriesTab />}
                    {activeTab === 'invoices' && <InvoicesTab initialInvoiceData={initialInvoiceData} clearInitialInvoiceData={clearInitialInvoiceData} />}
                    {activeTab === 'reports' && <ReportsTab />}
                </div>
            </div>
        </div>
    );
};

export default AccountingPage;