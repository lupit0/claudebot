import React, { useState } from 'react';
import { createInquiry } from '../api';

export default function InquiryForm({ refData, onCreated, onCancel }) {
  const [form, setForm] = useState({
    counterparty: '', product_type: 'Repo', cash_direction: 'Receive',
    notional: '', currency: 'USD', tenor: '', rate_spread: '', haircut: '',
    source_channel: 'Bloomberg', sales_person: '', notes: '', pasted_data: '',
    collateral_items: [{ isin: '', description: '', quantity: '' }],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const setCollateral = (idx, key, val) => {
    const items = [...form.collateral_items];
    items[idx] = { ...items[idx], [key]: val };
    setForm(prev => ({ ...prev, collateral_items: items }));
  };

  const addCollateralRow = () => setForm(prev => ({
    ...prev, collateral_items: [...prev.collateral_items, { isin: '', description: '', quantity: '' }],
  }));

  const removeCollateralRow = (idx) => setForm(prev => ({
    ...prev, collateral_items: prev.collateral_items.filter((_, i) => i !== idx),
  }));

  const submit = async () => {
    if (!form.counterparty.trim()) { setError('Counterparty is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        notional: form.notional ? parseFloat(form.notional) : null,
        collateral_items: form.collateral_items
          .filter(c => c.isin.trim())
          .map(c => ({ ...c, quantity: c.quantity ? parseFloat(c.quantity) : null })),
      };
      const { data } = await createInquiry(payload);
      onCreated(data.id);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create inquiry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.titleRow}>
        <h2 style={styles.title}>New Trade Inquiry</h2>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {/* Trade details */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Trade Details</h3>
        <div style={styles.grid}>
          <Field label="Counterparty *">
            <input style={styles.input} value={form.counterparty} onChange={e => set('counterparty', e.target.value)} placeholder="e.g. Goldman Sachs" />
          </Field>
          <Field label="Product Type">
            <select style={styles.input} value={form.product_type} onChange={e => set('product_type', e.target.value)}>
              {refData.productTypes.map(p => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Cash Direction">
            <select style={styles.input} value={form.cash_direction} onChange={e => set('cash_direction', e.target.value)}>
              <option>Give</option>
              <option>Receive</option>
            </select>
          </Field>
          <Field label="Notional">
            <input style={styles.input} type="number" value={form.notional} onChange={e => set('notional', e.target.value)} placeholder="e.g. 50000000" />
          </Field>
          <Field label="Currency">
            <select style={styles.input} value={form.currency} onChange={e => set('currency', e.target.value)}>
              {refData.currencies.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Tenor">
            <input style={styles.input} value={form.tenor} onChange={e => set('tenor', e.target.value)} placeholder="e.g. 3M, 1Y, Open" />
          </Field>
          <Field label="Rate / Spread">
            <input style={styles.input} value={form.rate_spread} onChange={e => set('rate_spread', e.target.value)} placeholder="e.g. SOFR+25bps" />
          </Field>
          <Field label="Haircut">
            <input style={styles.input} value={form.haircut} onChange={e => set('haircut', e.target.value)} placeholder="e.g. 2%, 5%" />
          </Field>
        </div>
      </div>

      {/* Source info */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Source Information</h3>
        <div style={styles.grid}>
          <Field label="Channel">
            <select style={styles.input} value={form.source_channel} onChange={e => set('source_channel', e.target.value)}>
              {refData.channels.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Sales Person">
            <input style={styles.input} value={form.sales_person} onChange={e => set('sales_person', e.target.value)} placeholder="e.g. John Smith" />
          </Field>
        </div>
      </div>

      {/* Collateral */}
      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={styles.sectionTitle}>Collateral</h3>
          <button style={styles.addBtn} onClick={addCollateralRow}>+ Add ISIN</button>
        </div>
        {form.collateral_items.map((item, idx) => (
          <div key={idx} style={styles.collateralRow}>
            <input style={{ ...styles.input, flex: 2 }} placeholder="ISIN" value={item.isin} onChange={e => setCollateral(idx, 'isin', e.target.value)} />
            <input style={{ ...styles.input, flex: 3 }} placeholder="Description (optional)" value={item.description} onChange={e => setCollateral(idx, 'description', e.target.value)} />
            <input style={{ ...styles.input, flex: 1 }} type="number" placeholder="Qty" value={item.quantity} onChange={e => setCollateral(idx, 'quantity', e.target.value)} />
            {form.collateral_items.length > 1 && (
              <button style={styles.removeBtn} onClick={() => removeCollateralRow(idx)}>×</button>
            )}
          </div>
        ))}
      </div>

      {/* Notes & pasted data */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Notes & Data</h3>
        <Field label="Freeform Notes">
          <textarea style={{ ...styles.input, minHeight: 80 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional context about this inquiry..." />
        </Field>
        <Field label="Pasted Data (tables, lists, etc.)">
          <textarea style={{ ...styles.input, minHeight: 100, fontFamily: 'monospace', fontSize: 12 }} value={form.pasted_data} onChange={e => set('pasted_data', e.target.value)} placeholder="Paste a table, bond list, or any structured data here..." />
        </Field>
      </div>

      <div style={styles.footer}>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button style={styles.submitBtn} onClick={submit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Inquiry'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

const styles = {
  container: { background: '#1e293b', borderRadius: 8, border: '1px solid #334155', padding: 24 },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' },
  section: { marginBottom: 24, padding: 16, background: '#0f172a', borderRadius: 8, border: '1px solid #334155' },
  sectionTitle: { margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: '#94a3b8' },
  input: { padding: '8px 10px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  collateralRow: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' },
  addBtn: { background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  removeBtn: { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  submitBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  cancelBtn: { background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 6, padding: '10px 16px', cursor: 'pointer', fontSize: 13 },
  error: { background: '#7f1d1d', color: '#fecaca', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13 },
};
