import React, { useState, useEffect, useCallback } from 'react';
import { fetchInquiries, fetchStats, fetchProductTypes, fetchCurrencies } from './api';
import Blotter from './components/Blotter';
import InquiryForm from './components/InquiryForm';
import InquiryDetail from './components/InquiryDetail';

const VIEWS = { BLOTTER: 'blotter', NEW: 'new', DETAIL: 'detail' };

export default function App() {
  const [view, setView] = useState(VIEWS.BLOTTER);
  const [selectedId, setSelectedId] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [stats, setStats] = useState({});
  const [filters, setFilters] = useState({});
  const [refData, setRefData] = useState({ productTypes: [], currencies: [] });

  const loadInquiries = useCallback(async () => {
    try {
      const { data } = await fetchInquiries(filters);
      setInquiries(data);
    } catch (e) { console.error(e); }
  }, [filters]);

  const loadStats = async () => {
    try {
      const { data } = await fetchStats();
      setStats(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    Promise.all([fetchProductTypes(), fetchCurrencies()]).then(
      ([pt, cur]) => setRefData({ productTypes: pt.data, currencies: cur.data })
    );
  }, []);

  useEffect(() => { loadInquiries(); loadStats(); }, [loadInquiries]);

  const openDetail = (id) => { setSelectedId(id); setView(VIEWS.DETAIL); };
  const goBlotter = () => { setView(VIEWS.BLOTTER); loadInquiries(); loadStats(); };

  return (
    <div style={styles.app}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.title} onClick={goBlotter}>Trade Inquiry Tracker</h1>
          <div style={styles.headerRight}>
            <div style={styles.statsBar}>
              <StatBadge label="Total" value={stats.total} color="#64748b" />
              <StatBadge label="New" value={stats.new} color="#f59e0b" />
              <StatBadge label="Responded" value={stats.responded} color="#3b82f6" />
              <StatBadge label="Traded" value={stats.traded} color="#10b981" />
              <StatBadge label="Declined" value={stats.declined} color="#ef4444" />
            </div>
            {view !== VIEWS.NEW && (
              <button style={styles.newBtn} onClick={() => setView(VIEWS.NEW)}>+ New Inquiry</button>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <main style={styles.main}>
        {view === VIEWS.BLOTTER && (
          <Blotter
            inquiries={inquiries}
            filters={filters}
            setFilters={setFilters}
            onSelect={openDetail}
            refData={refData}
          />
        )}
        {view === VIEWS.NEW && (
          <InquiryForm
            refData={refData}
            onCreated={(id) => openDetail(id)}
            onCancel={goBlotter}
          />
        )}
        {view === VIEWS.DETAIL && selectedId && (
          <InquiryDetail
            inquiryId={selectedId}
            refData={refData}
            onBack={goBlotter}
          />
        )}
      </main>
    </div>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <span style={{ ...styles.badge, borderColor: color }}>
      <span style={{ color, fontWeight: 700, fontSize: 16 }}>{value ?? '-'}</span>
      <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 4 }}>{label}</span>
    </span>
  );
}

const styles = {
  app: { fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif", background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' },
  header: { background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100 },
  headerInner: { maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 },
  title: { fontSize: 18, fontWeight: 700, color: '#f1f5f9', cursor: 'pointer', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  statsBar: { display: 'flex', gap: 8 },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 6, border: '1px solid', background: '#1e293b' },
  newBtn: { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  main: { maxWidth: 1400, margin: '0 auto', padding: '20px 24px' },
};
