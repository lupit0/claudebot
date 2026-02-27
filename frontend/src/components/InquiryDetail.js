import React, { useState, useEffect, useRef } from 'react';
import { fetchInquiry, updateInquiry, addResponse, uploadAttachment, deleteAttachment, downloadAttachmentUrl, addCollateral, removeCollateral } from '../api';

const STATUS_COLORS = { New: '#f59e0b', Responded: '#3b82f6', Traded: '#10b981', Declined: '#ef4444' };

export default function InquiryDetail({ inquiryId, refData, onBack }) {
  const [inq, setInq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await fetchInquiry(inquiryId);
      setInq(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [inquiryId]);

  if (loading || !inq) return <div style={{ color: '#94a3b8', padding: 40, textAlign: 'center' }}>Loading...</div>;

  return (
    <div>
      <div style={styles.topBar}>
        <button style={styles.backBtn} onClick={onBack}>&larr; Back to Blotter</button>
        <StatusChanger inq={inq} onChanged={load} />
      </div>

      {/* Header card */}
      <div style={styles.headerCard}>
        <div style={styles.headerTop}>
          <div>
            <span style={{ ...styles.statusBadge, background: STATUS_COLORS[inq.status] }}>{inq.status}</span>
            <span style={styles.idLabel}>#{inq.id}</span>
          </div>
          <span style={styles.dateLabel}>
            Created: {new Date(inq.created_at).toLocaleString('en-GB')} | Updated: {new Date(inq.updated_at).toLocaleString('en-GB')}
          </span>
        </div>
        <h2 style={styles.counterparty}>{inq.counterparty}</h2>
        <div style={styles.tagRow}>
          <Tag label="Product" value={inq.product_type} />
          <Tag label="Direction" value={inq.cash_direction} color={inq.cash_direction === 'Give' ? '#ef4444' : '#10b981'} />
          <Tag label="Notional" value={inq.notional ? `${inq.currency} ${Number(inq.notional).toLocaleString()}` : '-'} />
          <Tag label="Tenor" value={inq.tenor || '-'} />
          <Tag label="Rate" value={inq.rate_spread || '-'} />
          <Tag label="Haircut" value={inq.haircut || '-'} />
          {inq.sales_person && <Tag label="Sales" value={inq.sales_person} />}
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabBar}>
        {['details', 'responses', 'attachments', 'audit'].map(t => (
          <button key={t} style={tab === t ? styles.tabActive : styles.tab} onClick={() => setTab(t)}>
            {t === 'details' && 'Details & Collateral'}
            {t === 'responses' && `Responses (${inq.responses.length})`}
            {t === 'attachments' && `Files (${inq.attachments.length})`}
            {t === 'audit' && `Audit Log (${inq.audit_logs.length})`}
          </button>
        ))}
      </div>

      <div style={styles.tabContent}>
        {tab === 'details' && <DetailsTab inq={inq} onRefresh={load} />}
        {tab === 'responses' && <ResponsesTab inq={inq} onRefresh={load} />}
        {tab === 'attachments' && <AttachmentsTab inq={inq} fileRef={fileRef} onRefresh={load} />}
        {tab === 'audit' && <AuditTab inq={inq} />}
      </div>
    </div>
  );
}

/* ─── Status Changer ──────────────────────────────────────── */
function StatusChanger({ inq, onChanged }) {
  const statuses = ['New', 'Responded', 'Traded', 'Declined'];
  const change = async (newStatus) => {
    if (newStatus === inq.status) return;
    await updateInquiry(inq.id, { status: newStatus });
    onChanged();
  };
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {statuses.map(s => (
        <button key={s} onClick={() => change(s)} style={{
          padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          border: s === inq.status ? 'none' : '1px solid #475569',
          background: s === inq.status ? STATUS_COLORS[s] : 'transparent',
          color: s === inq.status ? '#fff' : '#94a3b8',
        }}>{s}</button>
      ))}
    </div>
  );
}

/* ─── Details Tab ─────────────────────────────────────────── */
function DetailsTab({ inq, onRefresh }) {
  const [newCol, setNewCol] = useState({ isin: '', description: '', quantity: '' });

  const handleAddCol = async () => {
    if (!newCol.isin.trim()) return;
    await addCollateral(inq.id, { ...newCol, quantity: newCol.quantity ? parseFloat(newCol.quantity) : null });
    setNewCol({ isin: '', description: '', quantity: '' });
    onRefresh();
  };

  const handleRemoveCol = async (itemId) => {
    await removeCollateral(inq.id, itemId);
    onRefresh();
  };

  return (
    <div>
      {/* Notes */}
      {inq.notes && (
        <div style={styles.detailBox}>
          <h4 style={styles.detailLabel}>Notes</h4>
          <p style={styles.detailText}>{inq.notes}</p>
        </div>
      )}

      {/* Pasted data */}
      {inq.pasted_data && (
        <div style={styles.detailBox}>
          <h4 style={styles.detailLabel}>Pasted Data</h4>
          <pre style={styles.pre}>{inq.pasted_data}</pre>
        </div>
      )}

      {/* Collateral */}
      <div style={styles.detailBox}>
        <h4 style={styles.detailLabel}>Collateral ({inq.collateral_items.length} items)</h4>
        {inq.collateral_items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={styles.colTh}>ISIN</th>
                <th style={styles.colTh}>Description</th>
                <th style={styles.colTh}>Quantity</th>
                <th style={styles.colTh}></th>
              </tr>
            </thead>
            <tbody>
              {inq.collateral_items.map(c => (
                <tr key={c.id}>
                  <td style={styles.colTd}>{c.isin}</td>
                  <td style={styles.colTd}>{c.description || '-'}</td>
                  <td style={styles.colTd}>{c.quantity ? Number(c.quantity).toLocaleString() : '-'}</td>
                  <td style={styles.colTd}>
                    <button style={styles.removeSmall} onClick={() => handleRemoveCol(c.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input style={styles.smallInput} placeholder="ISIN" value={newCol.isin} onChange={e => setNewCol(p => ({ ...p, isin: e.target.value }))} />
          <input style={styles.smallInput} placeholder="Description" value={newCol.description} onChange={e => setNewCol(p => ({ ...p, description: e.target.value }))} />
          <input style={{ ...styles.smallInput, width: 80 }} type="number" placeholder="Qty" value={newCol.quantity} onChange={e => setNewCol(p => ({ ...p, quantity: e.target.value }))} />
          <button style={styles.addSmall} onClick={handleAddCol}>Add</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Responses Tab ───────────────────────────────────────── */
function ResponsesTab({ inq, onRefresh }) {
  const [form, setForm] = useState({ responder: '', rate_spread: '', haircut: '', terms: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await addResponse(inq.id, form);
      setForm({ responder: '', rate_spread: '', haircut: '', terms: '', notes: '' });
      onRefresh();
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  return (
    <div>
      {/* Existing responses */}
      {inq.responses.map(r => (
        <div key={r.id} style={styles.responseCard}>
          <div style={styles.respHeader}>
            <span style={{ fontWeight: 600 }}>{r.responder || 'Unknown'}</span>
            <span style={{ color: '#64748b', fontSize: 12 }}>{new Date(r.created_at).toLocaleString('en-GB')}</span>
          </div>
          <div style={styles.respGrid}>
            {r.rate_spread && <div><span style={styles.respLabel}>Rate/Spread:</span> {r.rate_spread}</div>}
            {r.haircut && <div><span style={styles.respLabel}>Haircut:</span> {r.haircut}</div>}
            {r.terms && <div><span style={styles.respLabel}>Terms:</span> {r.terms}</div>}
          </div>
          {r.notes && <p style={{ margin: '8px 0 0', color: '#cbd5e1', fontSize: 13 }}>{r.notes}</p>}
        </div>
      ))}

      {/* New response form */}
      <div style={styles.newRespForm}>
        <h4 style={styles.detailLabel}>Add Response</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input style={styles.smallInput} placeholder="Responder name" value={form.responder} onChange={e => setForm(p => ({ ...p, responder: e.target.value }))} />
          <input style={styles.smallInput} placeholder="Rate / Spread" value={form.rate_spread} onChange={e => setForm(p => ({ ...p, rate_spread: e.target.value }))} />
          <input style={styles.smallInput} placeholder="Haircut" value={form.haircut} onChange={e => setForm(p => ({ ...p, haircut: e.target.value }))} />
          <input style={styles.smallInput} placeholder="Terms" value={form.terms} onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} />
        </div>
        <textarea style={{ ...styles.smallInput, width: '100%', minHeight: 60, marginTop: 10, boxSizing: 'border-box' }} placeholder="Additional notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
        <button style={{ ...styles.addSmall, marginTop: 10 }} onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Response'}
        </button>
      </div>
    </div>
  );
}

/* ─── Attachments Tab ─────────────────────────────────────── */
function AttachmentsTab({ inq, fileRef, onRefresh }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadAttachment(inq.id, file);
      onRefresh();
    } catch (err) { console.error(err); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (id) => {
    await deleteAttachment(id);
    onRefresh();
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.bmp,.msg,.eml,.ppt,.pptx,.zip,.rar,.7z" onChange={handleUpload} style={{ display: 'none' }} />
        <button style={styles.addSmall} onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'Uploading...' : '+ Upload File'}
        </button>
        <span style={{ marginLeft: 10, fontSize: 12, color: '#64748b' }}>PDF, Excel, Word, Outlook (.msg/.eml), PowerPoint, images, archives — any file</span>
      </div>

      {inq.attachments.length === 0 ? (
        <p style={{ color: '#64748b' }}>No files attached yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inq.attachments.map(att => (
            <div key={att.id} style={styles.fileRow}>
              <a href={downloadAttachmentUrl(att.id)} style={styles.fileLink} download>{att.filename}</a>
              <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(att.uploaded_at).toLocaleString('en-GB')}</span>
              <button style={styles.removeSmall} onClick={() => handleDelete(att.id)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Audit Tab ───────────────────────────────────────────── */
function AuditTab({ inq }) {
  return (
    <div>
      {inq.audit_logs.length === 0 ? (
        <p style={{ color: '#64748b' }}>No audit entries.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {inq.audit_logs.map(log => (
            <div key={log.id} style={styles.auditRow}>
              <span style={styles.auditTime}>{new Date(log.created_at).toLocaleString('en-GB')}</span>
              <span style={styles.auditAction}>{log.action}</span>
              {log.details && <span style={styles.auditDetails}>{log.details}</span>}
              {log.actor && <span style={styles.auditActor}>by {log.actor}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────── */
function Tag({ label, value, color }) {
  return (
    <span style={styles.tag}>
      <span style={{ color: '#64748b', fontSize: 11 }}>{label}</span>
      <span style={{ color: color || '#e2e8f0', fontWeight: 600, fontSize: 13 }}>{value}</span>
    </span>
  );
}

const styles = {
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backBtn: { background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 6, padding: '8px 14px', cursor: 'pointer', fontSize: 13 },
  headerCard: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 20, marginBottom: 16 },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusBadge: { display: 'inline-block', padding: '3px 10px', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 600 },
  idLabel: { marginLeft: 10, color: '#64748b', fontSize: 14 },
  dateLabel: { fontSize: 12, color: '#64748b' },
  counterparty: { margin: '8px 0 12px', fontSize: 24, fontWeight: 700, color: '#f1f5f9' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  tag: { display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 12px', background: '#0f172a', borderRadius: 6, border: '1px solid #334155' },
  tabBar: { display: 'flex', gap: 2, borderBottom: '1px solid #334155', marginBottom: 16 },
  tab: { background: 'transparent', border: 'none', color: '#64748b', padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500, borderBottom: '2px solid transparent' },
  tabActive: { background: 'transparent', border: 'none', color: '#3b82f6', padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, borderBottom: '2px solid #3b82f6' },
  tabContent: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: 20 },
  detailBox: { marginBottom: 20 },
  detailLabel: { margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  detailText: { margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.5 },
  pre: { margin: 0, padding: 12, background: '#0f172a', borderRadius: 6, border: '1px solid #334155', color: '#cbd5e1', fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap' },
  colTh: { padding: '6px 10px', textAlign: 'left', fontSize: 11, color: '#64748b', borderBottom: '1px solid #334155', textTransform: 'uppercase' },
  colTd: { padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #1e293b' },
  smallInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13 },
  addSmall: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  removeSmall: { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  responseCard: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 16, marginBottom: 12 },
  respHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  respGrid: { display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: '#e2e8f0' },
  respLabel: { color: '#64748b', fontWeight: 600 },
  newRespForm: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: 16, marginTop: 16 },
  fileRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#0f172a', borderRadius: 6, border: '1px solid #334155' },
  fileLink: { color: '#3b82f6', textDecoration: 'none', fontWeight: 500, fontSize: 13, flex: 1 },
  auditRow: { display: 'flex', gap: 12, padding: '8px 12px', borderBottom: '1px solid #1e293b', fontSize: 13, alignItems: 'center' },
  auditTime: { color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' },
  auditAction: { color: '#e2e8f0', fontWeight: 600 },
  auditDetails: { color: '#94a3b8', flex: 1 },
  auditActor: { color: '#64748b', fontSize: 12, fontStyle: 'italic' },
};
