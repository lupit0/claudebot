import React from 'react';

const STATUS_COLORS = {
  New: '#f59e0b',
  Responded: '#3b82f6',
  Traded: '#10b981',
  Declined: '#ef4444',
};

export default function Blotter({ inquiries, filters, setFilters, onSelect, refData }) {
  const update = (key, val) => setFilters(prev => ({ ...prev, [key]: val || undefined }));

  return (
    <div>
      {/* Filters */}
      <div style={styles.filterBar}>
        <input
          style={styles.search}
          placeholder="Search counterparty, sales, notes..."
          value={filters.search || ''}
          onChange={e => update('search', e.target.value)}
        />
        <select style={styles.select} value={filters.status || ''} onChange={e => update('status', e.target.value)}>
          <option value="">All Statuses</option>
          <option>New</option>
          <option>Responded</option>
          <option>Traded</option>
          <option>Declined</option>
        </select>
        <select style={styles.select} value={filters.product_type || ''} onChange={e => update('product_type', e.target.value)}>
          <option value="">All Products</option>
          {refData.productTypes.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {['ID', 'Status', 'Counterparty', 'Product', 'Direction', 'Notional', 'Ccy', 'Tenor', 'Rate', 'Haircut', 'Sales', 'Responses', 'Files', 'Created'].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inquiries.length === 0 ? (
              <tr><td colSpan={14} style={styles.empty}>No inquiries found. Click "+ New Inquiry" to create one.</td></tr>
            ) : inquiries.map(inq => (
              <tr key={inq.id} style={styles.tr} onClick={() => onSelect(inq.id)}>
                <td style={styles.td}>{inq.id}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.statusPill, background: STATUS_COLORS[inq.status] || '#64748b' }}>
                    {inq.status}
                  </span>
                </td>
                <td style={{ ...styles.td, fontWeight: 600 }}>{inq.counterparty}</td>
                <td style={styles.td}>{inq.product_type}</td>
                <td style={styles.td}>
                  <span style={{ color: inq.cash_direction === 'Give' ? '#ef4444' : '#10b981' }}>
                    {inq.cash_direction}
                  </span>
                </td>
                <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {inq.notional ? Number(inq.notional).toLocaleString() : '-'}
                </td>
                <td style={styles.td}>{inq.currency}</td>
                <td style={styles.td}>{inq.tenor || '-'}</td>
                <td style={styles.td}>{inq.rate_spread || '-'}</td>
                <td style={styles.td}>{inq.haircut || '-'}</td>
                <td style={styles.td}>{inq.sales_person || '-'}</td>
                <td style={{ ...styles.td, textAlign: 'center' }}>{inq.response_count}</td>
                <td style={{ ...styles.td, textAlign: 'center' }}>{inq.attachment_count}</td>
                <td style={{ ...styles.td, fontSize: 12, color: '#94a3b8' }}>
                  {new Date(inq.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  filterBar: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 13 },
  select: { padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', fontSize: 13 },
  tableWrap: { overflowX: 'auto', borderRadius: 8, border: '1px solid #334155' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { background: '#1e293b', padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' },
  tr: { cursor: 'pointer', transition: 'background 0.15s' },
  td: { padding: '10px 12px', borderBottom: '1px solid #1e293b', whiteSpace: 'nowrap' },
  statusPill: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, color: '#fff', fontSize: 11, fontWeight: 600 },
  empty: { textAlign: 'center', padding: 40, color: '#64748b' },
};
