/**
 * Format Ollama generation stats for display.
 * Returns '' when stats are missing (mock mode / unsupported provider).
 */
export function formatGenerationStats(stats) {
  if (!stats) return '';

  const parts = [];
  const fmtDuration = (ms) => {
    if (typeof ms !== 'number') return null;
    return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
  };

  if (stats.totalDurationMs != null) parts.push(`总耗时 ${fmtDuration(stats.totalDurationMs)}`);
  if (stats.loadDurationMs != null) parts.push(`加载 ${fmtDuration(stats.loadDurationMs)}`);

  if (stats.promptEvalCount != null) {
    const dur = fmtDuration(stats.promptEvalDurationMs);
    parts.push(`预填充 ${dur ? `${dur} / ` : ''}${stats.promptEvalCount} tokens`);
  }

  if (stats.evalCount != null) {
    const dur = fmtDuration(stats.evalDurationMs);
    parts.push(`生成 ${dur ? `${dur} / ` : ''}${stats.evalCount} tokens`);
  }

  if (stats.tokensPerSecond != null) {
    parts.push(`${stats.tokensPerSecond.toFixed(2)} tok/s`);
  }

  return parts.join(' · ');
}
