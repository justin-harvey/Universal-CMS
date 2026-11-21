// Studio — the admin SPA (scaffold shell).
//
// Adapted from ebneo-poc's StudioApp. This scaffold ships the SPINE only:
//   magic-link login (invite-only) -> authorization check against public.editors
//   -> a DB health strip (idle/unreachable) -> placeholder collection tabs.
//
// The full per-collection editors (announcements/events/documents/groups/faqs),
// the email review queue UI, guided onboarding, and inline help are the M5
// milestone (see BUILD-PLAN.md). Everything already here is gated by RLS; no
// secret is in this bundle.

import React, { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './supabaseClient.js';

const COLLECTIONS = ['Announcements', 'Events', 'Documents', 'Groups', 'FAQs', 'Email queue'];

const css = `
*{box-sizing:border-box} body{margin:0}
.st{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0b0c0c;background:#f3f2f1;min-height:100vh}
.st-head{display:flex;align-items:center;justify-content:space-between;padding:.8rem 1.2rem;background:#1b365d;color:#fff}
.st-head h1{font-size:1.05rem;margin:0;font-weight:600}
.st-main{max-width:1000px;margin:0 auto;padding:1.2rem}
.st-card{background:#fff;border:1px solid #b1b4b6;padding:1rem;margin-bottom:1rem}
.st-btn{border:0;padding:.55rem 1rem;font-weight:600;cursor:pointer;background:#005ea2;color:#fff}
.st-btn:disabled{opacity:.5;cursor:not-allowed}
.st-input{width:100%;padding:.5rem .6rem;border:1px solid #b1b4b6;font-size:.95rem}
.st-center{max-width:440px;margin:7vh auto;padding:0 1rem}
.st-tabs{display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:1rem;border-bottom:1px solid #b1b4b6}
.st-tab{padding:.5rem .8rem;border:0;background:transparent;cursor:pointer;font-weight:600;color:#1a4480}
.st-tab.on{border-bottom:3px solid #005ea2}
.st-note{padding:.6rem .8rem;margin:.5rem 0;border-left:10px solid #005ea2;background:#e1f3f8}
.st-note.err{border-color:#a10808;background:#fdeaea}
.st-health{display:flex;align-items:center;gap:.6rem;padding:.5rem 1.2rem;font-size:.85rem;background:#e3f2ea;color:#005c31;border-bottom:1px solid #b6e39a}
.st-health.down{background:#fdeaea;color:#a10808} .st-health.warn{background:#fff5d6;color:#6b4700}
.st-health .dot{width:10px;height:10px;border-radius:50%;background:currentColor}
.st-health .actions{margin-left:auto}
`;

function Health() {
  // Lightweight port of ebneo's health strip: a trivial read proves the DB is
  // reachable and not auto-paused (the keep-alive Action should prevent pausing).
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
      <span className="actions"><button className="st-btn" onClick={ping}>Ping now</button></span>
    </div>
  );
}

export default function StudioApp({ inboundAddress }) {
  const [session, setSession] = useState(null);
  const [editor, setEditor] = useState(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState(COLLECTIONS[0]);

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

  async function sendLink(e) {
    e.preventDefault();
    setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/studio` },
    });
    if (error) setErr(error.message); else setSent(true);
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

  return (<><style>{css}</style><div className="st">
    <div className="st-head">
      <h1>Studio</h1>
      <div>{editor?.email} ({editor?.role}) ·{' '}
        <button className="st-btn" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
    </div>
    <Health />
    <div className="st-main">
      <div className="st-tabs">
        {COLLECTIONS.map((c) => (
          <button key={c} className={`st-tab ${tab === c ? 'on' : ''}`} onClick={() => setTab(c)}>{c}</button>
        ))}
      </div>
      <div className="st-card">
        <h2>{tab}</h2>
        <p className="st-note">
          Editor for <strong>{tab}</strong> is the M5 milestone. The schema, RLS, and
          publish→rebuild trigger backing it are already live.
        </p>
        <p>Content can also arrive by email at <strong>{inboundAddress}</strong>; held items
        will surface under <em>Email queue</em>.</p>
      </div>
    </div>
  </div></>);
}
