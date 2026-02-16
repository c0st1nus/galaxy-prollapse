<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { ui } from '$lib/constants/ui';
	import AppIcon from '$lib/components/ui/AppIcon.svelte';
	import {
		cleanerGetQuestionnaire,
		cleanerSubmitQuestionnaire,
		type Question,
		type QuestionnaireAnswer,
		type QuestionnaireState
	} from '$lib/api';

	let {
		taskId,
		token,
		onChecklistGenerated
	}: {
		taskId: number;
		token: string;
		onChecklistGenerated?: () => void;
	} = $props();

	let loading = $state(true);
	let submitting = $state(false);
	let error = $state('');
	let questionnaireState = $state<QuestionnaireState | null>(null);

	let currentIdx = $state(0);
	let singleAnswer = $state('');
	let multiAnswers = $state<string[]>([]);
	let boolAnswer = $state<string | null>(null);

	async function load() {
		loading = true;
		error = '';
		try {
			questionnaireState = await cleanerGetQuestionnaire(token, taskId);
			currentIdx = 0;
			resetInputs();
		} catch (e: unknown) {
			error = (e instanceof Error ? e.message : '') || m.questionnaire_error();
		} finally {
			loading = false;
		}
	}

	function resetInputs() {
		singleAnswer = '';
		multiAnswers = [];
		boolAnswer = null;
	}

	function currentQuestion(): Question | null {
		if (!questionnaireState || !questionnaireState.next_questions.length) return null;
		return questionnaireState.next_questions[currentIdx] || null;
	}

	function buildAnswer(): QuestionnaireAnswer | null {
		const q = currentQuestion();
		if (!q) return null;
		if (q.type === 'single') {
			if (!singleAnswer) return null;
			return { question_id: q.id, answer: singleAnswer };
		}
		if (q.type === 'multi') {
			if (!multiAnswers.length) return null;
			return { question_id: q.id, answer: multiAnswers };
		}
		if (q.type === 'boolean') {
			if (!boolAnswer) return null;
			return { question_id: q.id, answer: boolAnswer };
		}
		return null;
	}

	async function submitAnswer() {
		const answer = buildAnswer();
		if (!answer) return;
		submitting = true;
		error = '';
		try {
			questionnaireState = await cleanerSubmitQuestionnaire(token, taskId, [answer]);
			currentIdx = 0;
			resetInputs();
			if (questionnaireState.is_complete && onChecklistGenerated) {
				onChecklistGenerated();
			}
		} catch (e: unknown) {
			error = (e instanceof Error ? e.message : '') || m.questionnaire_error();
		} finally {
			submitting = false;
		}
	}

	function toggleMulti(value: string) {
		if (value === 'none') {
			multiAnswers = multiAnswers.includes('none') ? [] : ['none'];
			return;
		}
		if (multiAnswers.includes(value)) {
			multiAnswers = multiAnswers.filter((v: string) => v !== value);
		} else {
			multiAnswers = [...multiAnswers.filter((v: string) => v !== 'none'), value];
		}
	}

	function planLabelFromLevel(level: number | null | undefined): string {
		if (level === 1) return m.app_admin_wizard_level_1();
		if (level === 2) return m.app_admin_wizard_level_2();
		if (level === 3) return m.app_admin_wizard_level_3();
		if (level === 4) return m.app_admin_wizard_level_4();
		if (level === 5) return m.app_admin_wizard_level_5();
		return '';
	}

	function standardLevel(standard: string | null | undefined): number | null {
		if (!standard) return null;
		const match = /^appa_(\d)$/i.exec(standard);
		if (!match) return null;
		const level = Number(match[1]);
		if (!Number.isInteger(level) || level < 1 || level > 5) return null;
		return level;
	}

	function planLabelFromStandard(standard: string | null | undefined): string {
		const level = standardLevel(standard);
		if (level) return planLabelFromLevel(level);
		return standard ?? '';
	}

	$effect(() => {
		if (taskId && token) load();
	});
</script>

<div class={ui.panel}>
	<h3 class="flex items-center gap-2 text-lg font-bold">
		<AppIcon name="clipboard" class="h-5 w-5" />
		{m.questionnaire_title()}
	</h3>
	<p class="mt-1 text-sm text-[var(--text-soft)]">{m.questionnaire_subtitle()}</p>

	{#if loading}
		<p class="mt-4 text-sm text-[var(--text-soft)]">{m.questionnaire_loading()}</p>
	{:else if error}
		<div class={ui.alertError + ' mt-4'}>{error}</div>
	{:else if questionnaireState}
		<div class="mt-3 flex flex-wrap gap-2 text-xs">
			<span
				class="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
			>
				{m.questionnaire_room_type({ type: questionnaireState.room_type })}
			</span>
			<span
				class="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200"
			>
				{m.questionnaire_standard({
					standard: planLabelFromStandard(questionnaireState.cleaning_standard)
				})}
			</span>
		</div>

		{#if questionnaireState.is_complete}
			{#if questionnaireState.determined_appa_level}
				<div class="mt-4 rounded-xl border border-[var(--border)] bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:from-blue-950/30 dark:to-purple-950/30">
					<p class="text-xs font-medium uppercase tracking-wider text-[var(--text-soft)]">{m.questionnaire_determined_level()}</p>
					<p class="mt-1 text-xl font-bold">{planLabelFromLevel(questionnaireState.determined_appa_level)}</p>
				</div>
			{/if}
			<div class={ui.alertSuccess + ' mt-4'}>
				<div class="flex items-start gap-2">
					<AppIcon name="check-circle" class="mt-0.5 h-4 w-4" />
					<div>
						<p class="font-semibold">{m.questionnaire_complete_title()}</p>
						<p class="text-sm">{m.questionnaire_complete_body()}</p>
						{#if questionnaireState.generated_checklist}
							<p class="mt-1 text-sm font-medium">
								{m.questionnaire_generated_items({
									count: String(questionnaireState.generated_checklist.length)
								})}
							</p>
						{/if}
					</div>
				</div>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">
				{#if onChecklistGenerated}
					<button class={ui.primaryButton} onclick={onChecklistGenerated}>
						{m.questionnaire_view_checklist()}
					</button>
				{/if}
			</div>
		{:else if questionnaireState.next_questions.length === 0}
			<p class="mt-4 text-sm text-[var(--text-soft)]">{m.questionnaire_no_questions()}</p>
		{:else}
			{@const q = currentQuestion()}
			{#if q}
				<div class="mt-4">
					<p class="mb-1 text-xs text-[var(--text-soft)]">
						{m.questionnaire_question_of({
							current: String(currentIdx + 1),
							total: String(questionnaireState.next_questions.length)
						})}
					</p>
					<p class="text-base font-semibold">{q.text}</p>

					<div class="mt-3 grid gap-2">
						{#if q.type === 'single' && q.options}
							{#each q.options as opt}
								<label
									class="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-hover)] has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-950"
								>
									<input
										type="radio"
										name="q_{q.id}"
										value={opt.value}
										checked={singleAnswer === opt.value}
										onchange={() => (singleAnswer = opt.value)}
										class="h-4 w-4 accent-blue-600"
									/>
									<span class="text-sm">{opt.label}</span>
								</label>
							{/each}
						{:else if q.type === 'multi' && q.options}
							<p class="text-xs text-[var(--text-soft)]">{m.questionnaire_select_all()}</p>
							{#each q.options as opt}
								<label
									class="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] p-3 transition-colors hover:bg-[var(--bg-hover)] has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 dark:has-[:checked]:bg-blue-950"
								>
									<input
										type="checkbox"
										checked={multiAnswers.includes(opt.value)}
										onchange={() => toggleMulti(opt.value)}
										class="h-4 w-4 rounded accent-blue-600"
									/>
									<span class="text-sm">{opt.label}</span>
								</label>
							{/each}
						{:else if q.type === 'boolean'}
							<div class="flex gap-3">
								<button
									type="button"
									class="flex-1 rounded-lg border p-3 text-center text-sm font-medium transition-colors {boolAnswer ===
									'yes'
										? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
										: 'border-[var(--border)] hover:bg-[var(--bg-hover)]'}"
									onclick={() => (boolAnswer = 'yes')}
								>
									{m.questionnaire_yes()}
								</button>
								<button
									type="button"
									class="flex-1 rounded-lg border p-3 text-center text-sm font-medium transition-colors {boolAnswer ===
									'no'
										? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
										: 'border-[var(--border)] hover:bg-[var(--bg-hover)]'}"
									onclick={() => (boolAnswer = 'no')}
								>
									{m.questionnaire_no()}
								</button>
							</div>
						{/if}
					</div>

					<button
						class={ui.primaryButton + ' mt-4 w-full'}
						disabled={submitting || !buildAnswer()}
						onclick={submitAnswer}
					>
						{#if submitting}
							{m.questionnaire_loading()}
						{:else if questionnaireState.next_questions.length === 1}
							{m.questionnaire_submit()}
						{:else}
							{m.questionnaire_next()}
						{/if}
					</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>
