export const ui = {
	panel:
		'rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow)]',
	panelSm:
		'rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow)] sm:p-8',
	input:
		'rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2.5 text-[var(--text-main)] focus:border-[var(--brand)] focus:outline-none',
	primaryButton:
		'rounded-xl bg-[var(--brand)] px-4 py-2 font-semibold text-white transition hover:bg-[var(--brand-strong)] disabled:opacity-60',
	secondaryButton:
		'rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-2 font-semibold transition hover:bg-[var(--bg-elevated)] disabled:opacity-60',
	label: 'grid gap-1 text-sm font-semibold text-[var(--text-soft)]',
	alertSuccess:
		'mt-5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-800',
	alertError: 'mt-5 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-800'
} as const;
