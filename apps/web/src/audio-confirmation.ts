/** Retry transport failures with the same action ID: a lost response may already
 * have advanced the round on the server. Business rejections must reach the caller. */
export async function confirmAudioLoaded(
  endpoint: string,
  action: unknown,
  isCurrent: () => boolean,
): Promise<void> {
  const body = JSON.stringify(action);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isCurrent()) return;
    let response: Response;
    let result: { error?: string };
    try {
      response = await fetch(endpoint + '/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(3000),
      });
      if (response.status >= 500) throw new Error('音频确认服务暂不可用');
      result = (await response.json()) as { error?: string };
    } catch (error) {
      if (attempt === 2)
        throw new Error('片段已加载，但网络确认失败，请检查连接后重新开局', {
          cause: error,
        });
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      continue;
    }
    if (!response.ok) throw new Error(result.error ?? '音频加载确认失败');
    return;
  }
}
