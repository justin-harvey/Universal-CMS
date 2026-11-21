// Studio — the admin SPA (M5: full per-collection CRUD + email review queue).
//
// The spine (magic-link login, invite-only authorization against public.editors,
// a DB health strip) is unchanged from the M0/M1 scaffold. M5 replaces the
// placeholder tabs with:
//   * a data-driven editor for each content collection (announcements, events,
//     documents, groups, faqs) — list, create, edit, delete, publish/unpublish —
//     driven by src/components/studio/collections.js;
//   * an Email queue tab working public.inbound_emails (approve → publish by
//     prefilling the right collection form; edit; discard) + an approved_senders
//     admin panel;
//   * a "Deploy now" button calling the request_deploy() RPC.
//
// Everything is gated by RLS: the browser holds only the anon key + the editor's
// magic-link JWT. No secret ships in this bundle.

import React, { useEffect, useState, useCallback } from 'react';
import { supabase, supabaseConfigured, DOCUMENTS_BUCKET } from './supabaseClient.js';
import {
  COLLECTIONS, blankRow, slugify, isoToLocalInput, toPayload, INTENT_TO_COLLECTION,
} from './collections.js';

const css = `
*{box-sizing:border-box} body{margin:0}
.st{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b0c0c;background:#f3f2f1;min-height:100vh}
.st-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1.2rem;background:#1b365d;color:#fff;flex-wrap:wrap}
.st-head h1{font-size:1.05rem;margin:0;font-weight:600}
.st-head .who{font-size:.85rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.st-main{max-width:1000px;margin:0 auto;padding:1.2rem}
.st-card{background:#fff;border:1px solid #b1b4b6;padding:1rem;margin-bottom:1rem}
.st-btn{border:0;padding:.55rem 1rem;font-weight:600;cursor:pointer;background:#005ea2;color:#fff;border-radius:2px}
.st-btn:disabled{opacity:.5;cursor:not-allowed}
.st-btn.ghost{background:#fff;color:#005ea2;border:1px solid #005ea2}
.st-btn.danger{background:#fff;color:#a10808;border:1px solid #a10808}
.st-btn.sm{padding:.3rem .6rem;font-size:.85rem}
.st-input,.st-select,.st-textarea{width:100%;padding:.5rem .6rem;border:1px solid #b1b4b6;font-size:.95rem;font-family:inherit;border-radius:2px}
.st-textarea{min-height:9rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem}
.st-center{max-width:440px;margin:7vh auto;padding:0 1rem}
.st-tabs{display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:1rem;border-bottom:1px solid #b1b4b6}
.st-tab{padding:.5rem .8rem;border:0;background:transparent;cursor:pointer;font-weight:600;color:#1a4480}
.st-tab.on{border-bottom:3px solid #005ea2}
.st-tab .count{display:inline-block;margin-left:.35rem;background:#d4351c;color:#fff;border-radius:10px;font-size:.7rem;padding:0 .4rem}
.st-note{padding:.6rem .8rem;margin:.5rem 0;border-left:10px solid #005ea2;background:#e1f3f8}
.st-note.err{border-color:#a10808;background:#fdeaea}
.st-note.ok{border-color:#00703c;background:#e3f2ea}
.st-health{display:flex;align-items:center;gap:.6rem;padding:.5rem 1.2rem;font-size:.85rem;background:#e3f2ea;color:#005c31;border-bottom:1px solid #b6e39a}
.st-health.down{background:#fdeaea;color:#a10808} .st-health.warn{background:#fff5d6;color:#6b4700}
.st-health .dot{width:10px;height:10px;border-radius:50%;background:currentColor}
.st-health .actions{margin-left:auto}
.st-field{margin-bottom:.9rem}
.st-field label{display:block;font-weight:600;margin-bottom:.25rem;font-size:.9rem}
.st-field .help{font-size:.8rem;color:#505a5f;margin:.2rem 0 0}
.st-field.row{display:flex;align-items:center;gap:.5rem}
.st-field.row label{margin:0}
.st-table{width:100%;border-collapse:collapse}
.st-table th,.st-table td{text-align:left;padding:.5rem .4rem;border-bottom:1px solid #e3e3e3;font-size:.9rem;vertical-align:top}
.st-table th{font-size:.75rem;text-transform:uppercase;letter-spacing:.03em;color:#505a5f}
.st-actions{display:flex;gap:.4rem;flex-wrap:wrap}
.st-badge{display:inline-block;padding:.1rem .45rem;border-radius:3px;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.02em}
.st-badge.published{background:#cce2d8;color:#00543c} .st-badge.draft{background:#eceae8;color:#505a5f}
.st-badge.cancelled{background:#f6d7d2;color:#942514} .st-badge.email{background:#dbe3f0;color:#1a4480}
.st-bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.8rem;flex-wrap:wrap}
.st-empty{color:#505a5f;font-style:italic;padding:.6rem 0}
.st-toolbar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.8rem}
.st-mono{font-family:ui-monospace,Menlo,monospace;font-size:.82rem;white-space:pre-wrap;word-break:break-word;background:#f8f8f8;border:1px solid #e3e3e3;padding:.5rem;max-height:14rem;overflow:auto}
.st-sub{font-size:.8rem;color:#505a5f}
.st-formgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem}
.st-formgrid .full{grid-column:1 / -1}
@media(max-width:620px){.st-formgrid{grid-template-columns:1fr}}
`;

function Health() {
  const [state, setState] = useState({ status: 'checking', msg: 'Checking database…' });
  async function ping() {
    setState({ status: 'checking', msg: 'Checking database…' });
    if (!supabase) return setState({ status: 'down', msg: 'Not configured.' });
    const t0 = Date.now();
    const { error } = await supabase.from('editors').select('id').limit(1);
    if (error && /relation|configured|network|fetch/i.test(error.message)) {
      return setState({ status: 'down', msg: `Unreachable: ${error.message}` });
    }
    setState({ status: 'ok', msg: `Healthy (${Date.now() - t0}ms)` });
  }
  useEffect(() => { ping(); }, []);
  return (
    <div className={`st-health ${state.status === 'ok' ? '' : state.status === 'down' ? 'down' : 'warn'}`}>
      <span className="dot" />
      <span>{state.msg}</span>
      <span className="actions"><button className="st-btn sm ghost" onClick={ping}>Ping now</button></span>
    </div>
  );
}

function DeployButton() {
  const [state, setState] = useState({ busy: false, msg: '' });
  async function go() {
    setState({ busy: true, msg: '' });
    const { data, error } = await supabase.rpc('request_deploy');
    if (error) setState({ busy: false, msg: `Error: ${error.message}` });
    else if (data === 'not_configured') setState({ busy: false, msg: 'No build hook set yet.' });
    else setState({ busy: false, msg: 'Rebuild triggered.' });
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
      <button className="st-btn sm ghost" onClick={go} disabled={state.busy}>
        {state.busy ? 'Deploying…' : 'Deploy now'}
      </button>
      {state.msg && <span style={{ fontSize: '.78rem' }}>{state.msg}</span>}
    </span>
  );
}

// ── one form field ──────────────────────────────────────────────────────────
function Field({ field, value, onChange, documentCategories }) {
  const id = `f-${field.name}`;
  const common = { id, className: 'st-input' };
  let control;
  switch (field.type) {
    case 'textarea':
    case 'markdown':
      control = <textarea className="st-textarea" id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'checkbox':
      return (
        <div className="st-field row">
          <input type="checkbox" id={id} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <label htmlFor={id}>{field.label}</label>
          {field.help && <p className="help">{field.help}</p>}
        </div>
      );
    case 'date':
      control = <input type="date" {...common} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'datetime':
      control = <input type="datetime-local" {...common} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'number':
      control = <input type="number" {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'file':
      control = <input type="file" id={id} accept="application/pdf" onChange={(e) => onChange(e.target.files?.[0] || null)} />;
      break;
    case 'select': {
      const opts = field.options === 'documentCategories'
        ? (documentCategories || []).map((c) => ({ value: c, label: c }))
        : field.options;
      control = (
        <select className="st-select" id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    }
    case 'slug':
      control = <input type="text" {...common} value={value || ''} onChange={(e) => onChange(slugify(e.target.value))} />;
      break;
    default:
      control = <input type="text" {...common} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
  }
  const wide = field.type === 'textarea' || field.type === 'markdown';
  return (
    <div className={`st-field ${wide ? 'full' : ''}`}>
      <label htmlFor={id}>{field.label}{field.required ? ' *' : ''}</label>
      {control}
      {field.type === 'file' && value && <p className="help">Selected: {value.name}</p>}
      {field.help && <p className="help">{field.help}</p>}
    </div>
  );
}

// ── create / edit form for one collection row ────────────────────────────────
function CollectionForm({ collectionKey, spec, row, seed, editorId, documentCategories, onDone, onCancel }) {
  const isNew = !row?.id;
  const [form, setForm] = useState(() => {
    if (row) {
      // normalise stored values for the inputs
      const f = { ...row };
      for (const field of spec.fields) {
        if (field.type === 'datetime') f[field.name] = isoToLocalInput(row[field.name]);
      }
      return f;
    }
    return { ...blankRow(spec), ...(seed?.initial || {}) };
  });
  const [file, setFile] = useState(null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function setField(name, v) {
    setForm((prev) => {
      const next = { ...prev, [name]: v };
      // auto-derive the slug from the title field until an editor edits it
      if (isNew && !slugTouched && name === spec.titleField) next.slug = slugify(v);
      return next;
    });
    if (name === 'slug') setSlugTouched(true);
  }

  async function save(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const payload = toPayload(spec, form);
      if (!payload.slug) throw new Error('A slug is required.');

      // Documents: upload the PDF to the private bucket first, then store the path.
      if (collectionKey === 'documents' && file) {
        const path = `${payload.slug}/${Date.now()}-${file.name}`;
        const up = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, { upsert: false });
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
        payload.storage_path = path;
      }

      let targetId = row?.id;
      if (isNew) {
        payload.created_by = editorId;
        if (seed) payload.source = 'email';
        const { data, error } = await supabase.from(spec.table).insert(payload).select('id').single();
        if (error) throw new Error(error.message);
        targetId = data.id;
      } else {
        const { error } = await supabase.from(spec.table).update(payload).eq('id', row.id);
        if (error) throw new Error(error.message);
      }

      // If this save came from approving an email, close the loop on the queue row.
      if (seed?.inboundId) {
        const { error } = await supabase.from('inbound_emails').update({
          status: 'published', target_table: spec.table, target_id: targetId, reviewed_by: editorId,
        }).eq('id', seed.inboundId);
        if (error) throw new Error(`Saved, but failed to update the email: ${error.message}`);
      }
      onDone();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <form className="st-card" onSubmit={save}>
      <div className="st-bar">
        <h2 style={{ margin: 0 }}>{isNew ? 'New' : 'Edit'} {spec.tabKey.replace(/s$/, '')}</h2>
      </div>
      {seed && <p className="st-note">Publishing from an emailed submission. Review and adjust before saving.</p>}
      <div className="st-formgrid">
        {spec.fields.map((f) => (
          <Field
            key={f.name}
            field={f}
            value={f.type === 'file' ? file : form[f.name]}
            onChange={(v) => (f.type === 'file' ? setFile(v) : setField(f.name, v))}
            documentCategories={documentCategories}
          />
        ))}
      </div>
      {err && <p className="st-note err">{err}</p>}
      <div className="st-actions">
        <button className="st-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="st-btn ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// ── list + manage one collection ─────────────────────────────────────────────
function CollectionManager({ collectionKey, spec, editorId, documentCategories, seed, onSeedConsumed }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null); // row object, {} for new, or null for list
  const [activeSeed, setActiveSeed] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    const { data, error } = await supabase.from(spec.table).select('*')
      .order(spec.order.col, { ascending: spec.order.ascending });
    if (error) setErr(error.message); else setRows(data || []);
  }, [spec]);

  useEffect(() => { load(); }, [load]);

  // An approve-from-email seed opens the new-row form prefilled.
  useEffect(() => {
    if (seed) { setActiveSeed(seed); setEditing({}); onSeedConsumed?.(); }
  }, [seed, onSeedConsumed]);

  async function togglePublish(row) {
    const field = spec.statusField;
    const next = row[field] === 'published' ? 'draft' : 'published';
    const { error } = await supabase.from(spec.table).update({ [field]: next }).eq('id', row.id);
    if (error) setErr(error.message); else load();
  }

  async function remove(row) {
    const label = row[spec.titleField] || row.slug;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    const { error } = await supabase.from(spec.table).delete().eq('id', row.id);
    if (error) setErr(error.message); else load();
  }

  if (editing) {
    return (
      <CollectionForm
        collectionKey={collectionKey}
        spec={spec}
        row={editing.id ? editing : null}
        seed={activeSeed}
        editorId={editorId}
        documentCategories={documentCategories}
        onDone={() => { setEditing(null); setActiveSeed(null); load(); }}
        onCancel={() => { setEditing(null); setActiveSeed(null); }}
      />
    );
  }

  return (
    <div className="st-card">
      <div className="st-bar">
        <h2 style={{ margin: 0 }}>{spec.tabKey}</h2>
        <button className="st-btn sm" onClick={() => { setActiveSeed(null); setEditing({}); }}>+ New</button>
      </div>
      {err && <p className="st-note err">{err}</p>}
      {rows === null ? <p className="st-empty">Loading…</p>
        : rows.length === 0 ? <p className="st-empty">Nothing here yet. Click “+ New” — or email it in.</p>
          : (
            <table className="st-table">
              <thead>
                <tr><th>{spec.fields[0].label}</th><th>Status</th><th>Source</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const published = r[spec.statusField] === 'published';
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r[spec.titleField] || r.slug}</strong>
                        <div className="st-sub">/{r.slug}
                          {collectionKey === 'events' && r.status !== 'scheduled' && <> · <span className="st-badge cancelled">{r.status}</span></>}
                        </div>
                      </td>
                      <td><span className={`st-badge ${published ? 'published' : 'draft'}`}>{published ? 'published' : 'draft'}</span></td>
                      <td>{r.source === 'email' ? <span className="st-badge email">email</span> : <span className="st-sub">studio</span>}</td>
                      <td>
                        <div className="st-actions">
                          <button className="st-btn sm ghost" onClick={() => setEditing(r)}>Edit</button>
                          <button className="st-btn sm ghost" onClick={() => togglePublish(r)}>{published ? 'Unpublish' : 'Publish'}</button>
                          <button className="st-btn sm danger" onClick={() => remove(r)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
    </div>
  );
}

// ── approved_senders admin panel (inside the Email queue tab) ─────────────────
function SendersPanel({ isAdmin }) {
  const [rows, setRows] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [canPublish, setCanPublish] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('approved_senders').select('*').order('created_at', { ascending: true });
    if (error) setErr(error.message); else setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault(); setErr('');
    const { error } = await supabase.from('approved_senders')
      .insert({ email: email.trim().toLowerCase(), display_name: name.trim(), can_publish: canPublish });
    if (error) setErr(error.message);
    else { setEmail(''); setName(''); setCanPublish(true); load(); }
  }
  async function toggle(row, col) {
    const { error } = await supabase.from('approved_senders').update({ [col]: !row[col] }).eq('id', row.id);
    if (error) setErr(error.message); else load();
  }
  async function remove(row) {
    if (!window.confirm(`Remove ${row.email} from the allow-list?`)) return;
    const { error } = await supabase.from('approved_senders').delete().eq('id', row.id);
    if (error) setErr(error.message); else load();
  }

  return (
    <div className="st-card">
      <h2 style={{ marginTop: 0 }}>Approved senders</h2>
      <p className="st-sub">Only mail from an enabled address here is accepted. “Can publish” off routes that
        sender’s mail to review even above the confidence threshold.</p>
      {err && <p className="st-note err">{err}</p>}
      {rows === null ? <p className="st-empty">Loading…</p> : rows.length === 0
        ? <p className="st-empty">No senders yet.</p>
        : (
          <table className="st-table">
            <thead><tr><th>Address</th><th>Enabled</th><th>Can publish</th>{isAdmin && <th />}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.email}</strong>{r.display_name && <div className="st-sub">{r.display_name}</div>}</td>
                  <td>{isAdmin
                    ? <button className="st-btn sm ghost" onClick={() => toggle(r, 'enabled')}>{r.enabled ? 'Yes' : 'No'}</button>
                    : (r.enabled ? 'Yes' : 'No')}</td>
                  <td>{isAdmin
                    ? <button className="st-btn sm ghost" onClick={() => toggle(r, 'can_publish')}>{r.can_publish ? 'Yes' : 'No'}</button>
                    : (r.can_publish ? 'Yes' : 'No')}</td>
                  {isAdmin && <td><button className="st-btn sm danger" onClick={() => remove(r)}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      {isAdmin && (
        <form className="st-toolbar" onSubmit={add} style={{ marginTop: '1rem' }}>
          <input className="st-input" style={{ maxWidth: 230 }} type="email" required placeholder="sender@example.org"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="st-input" style={{ maxWidth: 180 }} type="text" placeholder="Display name (optional)"
            value={name} onChange={(e) => setName(e.target.value)} />
          <label className="st-sub" style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
            <input type="checkbox" checked={canPublish} onChange={(e) => setCanPublish(e.target.checked)} /> can publish
          </label>
          <button className="st-btn sm" type="submit">Add sender</button>
        </form>
      )}
    </div>
  );
}

// ── email review queue ───────────────────────────────────────────────────────
const QUEUE_STATUSES = ['received', 'pending_review'];
function EmailQueue({ isAdmin, onApprove, refreshKey }) {
  const [rows, setRows] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    let q = supabase.from('inbound_emails').select('*').order('created_at', { ascending: false });
    if (!showAll) q = q.in('status', QUEUE_STATUSES);
    const { data, error } = await q;
    if (error) setErr(error.message); else setRows(data || []);
  }, [showAll]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function discard(row) {
    if (!window.confirm('Discard this email from the queue?')) return;
    const { error } = await supabase.from('inbound_emails').update({ status: 'discarded' }).eq('id', row.id);
    if (error) setErr(error.message); else load();
  }

  return (
    <>
      <div className="st-card">
        <div className="st-bar">
          <h2 style={{ margin: 0 }}>Email queue</h2>
          <label className="st-sub" style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show all statuses
          </label>
        </div>
        {err && <p className="st-note err">{err}</p>}
        {rows === null ? <p className="st-empty">Loading…</p> : rows.length === 0
          ? <p className="st-empty">{showAll ? 'No emails yet.' : 'The queue is clear. 🎉'}</p>
          : rows.map((r) => (
            <div key={r.id} style={{ borderTop: '1px solid #e3e3e3', paddingTop: '.8rem', marginTop: '.8rem' }}>
              <div className="st-bar">
                <div>
                  <strong>{r.subject || '(no subject)'}</strong>
                  <div className="st-sub">
                    from {r.from_name ? `${r.from_name} <${r.from_email}>` : r.from_email}
                    {' · '}<span className="st-badge email">{r.intent}</span>
                    {r.confidence != null && <> · {Math.round(r.confidence * 100)}% confident</>}
                    {' · '}<span className={`st-badge ${r.status === 'published' ? 'published' : 'draft'}`}>{r.status}</span>
                    {r.spf_pass === false && ' · ⚠ SPF fail'}
                    {r.dkim_pass === false && ' · ⚠ DKIM fail'}
                  </div>
                </div>
              </div>
              {r.raw_text && <div className="st-mono">{r.raw_text.slice(0, 1200)}</div>}
              {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                <p className="st-sub">Attachments: {r.attachments.map((a) => a.filename).join(', ')}</p>
              )}
              {QUEUE_STATUSES.includes(r.status) && (
                <div className="st-actions" style={{ marginTop: '.5rem' }}>
                  <button className="st-btn sm" onClick={() => onApprove(r)}>Approve → publish</button>
                  <button className="st-btn sm danger" onClick={() => discard(r)}>Discard</button>
                </div>
              )}
              {r.status === 'published' && r.target_table && (
                <p className="st-sub">Published to {r.target_table}.</p>
              )}
            </div>
          ))}
      </div>
      <SendersPanel isAdmin={isAdmin} />
    </>
  );
}

export default function StudioApp({ inboundAddress, groupLabel, documentCategories = [], timezone }) {
  const [session, setSession] = useState(null);
  const [editor, setEditor] = useState(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('Announcements');
  const [queueCount, setQueueCount] = useState(0);
  const [seed, setSeed] = useState(null);        // approve-from-email prefill
  const [queueRefresh, setQueueRefresh] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) { setEditor(null); return; }
    supabase.from('editors').select('email,role').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setEditor(data));
  }, [session]);

  // Pending-review badge on the Email queue tab.
  const refreshQueueCount = useCallback(() => {
    if (!supabase || !session) return;
    supabase.from('inbound_emails').select('id', { count: 'exact', head: true }).in('status', QUEUE_STATUSES)
      .then(({ count }) => setQueueCount(count || 0));
  }, [session]);
  useEffect(() => { refreshQueueCount(); }, [refreshQueueCount, tab, queueRefresh]);

  async function sendLink(e) {
    e.preventDefault();
    setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/studio` },
    });
    if (error) setErr(error.message); else setSent(true);
  }

  // Approve an emailed submission: open the right collection's new-row form,
  // prefilled from the email, and remember which inbound row to close out.
  function approve(row) {
    const collectionKey = INTENT_TO_COLLECTION[row.intent] || 'announcements';
    const spec = COLLECTIONS[collectionKey];
    const titleText = row.subject || '(untitled)';
    const initial = {
      [spec.titleField]: titleText,
      slug: slugify(titleText),
      [spec.statusField]: 'published',
    };
    if ('body' in blankRow(spec)) initial.body = row.raw_text || '';
    if (collectionKey === 'faqs') initial.answer = row.raw_text || '';
    if (collectionKey === 'events' && row.intent === 'status_alert') initial.status = 'cancelled';
    setSeed({ collectionKey, initial, inboundId: row.id });
    setTab(spec.tabKey);
  }

  if (!supabaseConfigured) {
    return (<><style>{css}</style><div className="st"><div className="st-center">
      <div className="st-card"><h1>Studio</h1>
      <p className="st-note err">Not configured. Set <code>PUBLIC_SUPABASE_URL</code> and
      <code>PUBLIC_SUPABASE_ANON_KEY</code> in the environment.</p></div>
    </div></div></>);
  }

  if (!session) {
    return (<><style>{css}</style><div className="st"><div className="st-center">
      <div className="st-card">
        <h1>Studio sign-in</h1>
        <p>Invite-only. Enter your email and we'll send a one-time sign-in link — no password.</p>
        {sent ? (
          <p className="st-note">Check your inbox for the sign-in link.</p>
        ) : (
          <form onSubmit={sendLink}>
            <input className="st-input" type="email" required placeholder="you@example.org"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <p />
            <button className="st-btn" type="submit">Email me a sign-in link</button>
          </form>
        )}
        {err && <p className="st-note err">{err}</p>}
      </div>
    </div></div></>);
  }

  if (session && editor === null) {
    return (<><style>{css}</style><div className="st"><div className="st-center">
      <div className="st-card">
        <h1>Not an editor yet</h1>
        <p className="st-note err">You're signed in as {session.user.email}, but this account
        isn't on the editor roster. An administrator invites editors with
        <code>npm run invite</code>.</p>
        <button className="st-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div></div></>);
  }

  const isAdmin = editor?.role === 'admin';
  // Tab labels: Groups uses the org's configured word; the rest are fixed.
  const TABS = [
    { key: 'Announcements', label: 'Announcements', collection: 'announcements' },
    { key: 'Events', label: 'Events', collection: 'events' },
    { key: 'Documents', label: 'Documents', collection: 'documents' },
    { key: 'Groups', label: groupLabel || 'Groups', collection: 'groups' },
    { key: 'FAQs', label: 'FAQs', collection: 'faqs' },
    { key: 'Email queue', label: 'Email queue', collection: null },
  ];
  const current = TABS.find((t) => t.key === tab) || TABS[0];

  return (<><style>{css}</style><div className="st">
    <div className="st-head">
      <h1>Studio</h1>
      <div className="who">
        <DeployButton />
        <span>{editor?.email} ({editor?.role})</span>
        <button className="st-btn sm ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
    <Health />
    <div className="st-main">
      <div className="st-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`st-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'Email queue' && queueCount > 0 && <span className="count">{queueCount}</span>}
          </button>
        ))}
      </div>

      {current.collection ? (
        <CollectionManager
          key={current.collection}
          collectionKey={current.collection}
          spec={COLLECTIONS[current.collection]}
          editorId={session.user.id}
          documentCategories={documentCategories}
          seed={seed && seed.collectionKey === current.collection ? seed : null}
          onSeedConsumed={() => { setSeed(null); setQueueRefresh((n) => n + 1); refreshQueueCount(); }}
        />
      ) : (
        <>
          <p className="st-sub" style={{ marginTop: 0 }}>
            Content can also arrive by email at <strong>{inboundAddress}</strong>. Held items wait here;
            approve one to publish it (you’ll review it in the matching editor first).
          </p>
          <EmailQueue isAdmin={isAdmin} onApprove={approve} refreshKey={queueRefresh} />
        </>
      )}

      {timezone && current.collection === 'events' && (
        <p className="st-sub">Event times are entered and shown in <strong>{timezone}</strong>.</p>
      )}
    </div>
  </div></>);
}
