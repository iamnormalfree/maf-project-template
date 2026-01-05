// ABOUTME: Minimal committer helpers for staging branch creation and auto-revert on failure.
// ABOUTME: Intended for CI/automation hooks; integrates with existing git via execa.

export async function openPr(taskId: string) {
  const branch = `staging/${taskId}`;
  const mod: any = await import('execa');
  await mod.execa('git', ['checkout', '-B', branch]);
  await mod.execa('git', ['add', '-A']);
  try {
    await mod.execa('git', ['commit', '-m', `[maf] ${taskId}`]);
  } catch (_) {
    // no-op if nothing to commit
  }
  await mod.execa('git', ['push', '-u', 'origin', branch]);
  return { branch };
}

export async function autoRevert(_branch: string, _reason: string) {
  const mod: any = await import('execa');
  try {
    await mod.execa('git', ['revert', '--no-edit', 'HEAD']);
    await mod.execa('git', ['push']);
    return { reverted: true };
  } catch (e) {
    return { reverted: false, error: String((e as any)?.message || e) };
  }
}

