import { useState } from "react";

export function AdminTvPage() {
  const [displayEnabled, setDisplayEnabled] = useState(true);
  const [showWaitTimes, setShowWaitTimes] = useState(true);

  return (
    <main className="min-h-screen bg-[#eef1ed] p-4 text-ink sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="border-b border-[#cfd7d0] pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sage-deep">Display control</p>
          <h1 className="mt-1 font-display text-2xl text-ink">TV Now Serving</h1>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
          <section className="border border-[#d9dfd9] bg-[#17221c] p-5 text-white sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4"><p className="text-xs font-semibold tracking-wide text-[#b9cdbd]">LYN &amp; CO · NOW SERVING</p><span className="text-[10px] uppercase tracking-widest text-[#b9cdbd]">Live preview</span></div>
            <div className="grid min-h-[280px] place-items-center text-center"><div><p className="text-xs uppercase tracking-[0.24em] text-white/45">Now serving</p><p className="mt-3 font-display text-6xl text-[#d4b66f]">A-014</p><p className="mt-2 text-sm text-white/60">Please proceed to Station 02</p></div></div>
            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-center"><div><p className="text-[10px] uppercase tracking-widest text-white/40">Next up</p><p className="mt-1 text-lg font-semibold">A-015</p></div><div><p className="text-[10px] uppercase tracking-widest text-white/40">Queue</p><p className="mt-1 text-lg font-semibold">08 waiting</p></div></div>
          </section>
          <section className="border border-[#d9dfd9] bg-white p-5">
            <h2 className="text-sm font-semibold">Display settings</h2>
            <div className="mt-5 space-y-4 text-xs">
              <label className="flex items-center justify-between gap-4 border-b border-[#e5e9e5] pb-4"><span>TV display active</span><input type="checkbox" checked={displayEnabled} onChange={(event) => setDisplayEnabled(event.target.checked)} /></label>
              <label className="flex items-center justify-between gap-4 border-b border-[#e5e9e5] pb-4"><span>Show estimated waits</span><input type="checkbox" checked={showWaitTimes} onChange={(event) => setShowWaitTimes(event.target.checked)} /></label>
              <label className="block"><span>Display title</span><input defaultValue="Now Serving" className="mt-2 w-full border border-[#d9dfd9] px-3 py-2 outline-none focus:border-sage" /></label>
              <button type="button" className="w-full bg-[#26352d] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#34483b]">Save display settings</button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
