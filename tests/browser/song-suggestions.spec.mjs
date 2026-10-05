/* global document, innerWidth */
import { test, expect } from '@playwright/test';
import { room, view } from './helpers.mjs';

test('familiar songs follow tags, refresh without repeats and preserve saved reports', async ({
  browser,
  baseURL,
}, testInfo) => {
  const cdp = await browser.newBrowserCDPSession();
  expect((await cdp.send('Browser.getBrowserCommandLine')).arguments).toContain(
    '--mute-audio',
  );
  await cdp.detach();
  const r = await room(browser, baseURL, 1, {
    beforeEnter: async (page) => {
      // Vary only the displayed catalog; saved reports still use real fixture song IDs.
      await page.route('**/api/catalog', async (route) => {
        const response = await route.fetch();
        const catalog = await response.json();
        catalog.tags = [
          { id: 'lang:instrumental', dimension: 'languages', label: '测试音' },
          { id: 'genre:small', dimension: 'genres', label: '少量测试' },
          { id: 'culture:empty', dimension: 'cultures', label: '空标签' },
        ];
        catalog.songs = catalog.songs.slice(0, 14).map((song, i) => ({
          ...song,
          languages: i < 10 ? ['lang:instrumental'] : [],
          genres: i >= 9 && i < 12 ? ['genre:small'] : [],
        }));
        await route.fulfill({ response, json: catalog });
      });
    },
    onProfile: async (page) => {
      await expect(
        page.getByRole('button', { name: '少量测试', exact: true }),
      ).toBeVisible();
    },
  });
  const page = r.clients[0].page;
  const rows = page.locator('.song-row');
  const titles = () => rows.locator('strong').allTextContents();
  const tag = (name) => page.getByRole('button', { name, exact: true });
  const refresh = tag('再换一批');
  const search = page.getByLabel('搜索歌曲');
  const title = (n) => '合成测试音 ' + String(n).padStart(3, '0');
  try {
    await expect(rows).toHaveCount(5);
    const initial = await titles();
    expect(new Set(initial).size).toBe(5);
    const chosen = initial[0];
    await rows.first().getByRole('combobox').selectOption('familiar');
    await expect(rows.locator('strong')).toHaveText(initial);
    await refresh.click();
    await expect(rows).toHaveCount(5);
    expect((await titles()).every((t) => !initial.includes(t))).toBe(true);

    await tag('测试音').click();
    await expect(rows).toHaveCount(5);
    const languageBatch = await titles();
    const allowed = Array.from({ length: 10 }, (_, i) => title(i + 1));
    expect(languageBatch.every((t) => allowed.includes(t))).toBe(true);
    await refresh.click();
    const next = await titles();
    expect(
      next.every((t) => allowed.includes(t) && !languageBatch.includes(t)),
    ).toBe(true);

    // Searching remains global, even when a selected tag excludes this song.
    await search.fill(title(14));
    await expect(rows.locator('strong')).toHaveText([title(14)]);
    await refresh.click();
    await expect(search).toHaveValue('');
    await expect(rows).toHaveCount(5);
    expect((await titles()).every((t) => allowed.includes(t))).toBe(true);

    await search.fill(title(14));
    await tag('少量测试').click();
    await expect(search).toHaveValue('');
    await tag('测试音').click();
    await expect(rows).toHaveCount(3);
    expect((await titles()).sort()).toEqual([title(10), title(11), title(12)]);
    await refresh.click();
    expect((await titles()).sort()).toEqual([title(10), title(11), title(12)]);
    await tag('测试音').click();
    await expect(rows).toHaveCount(5); // union, not the one-song intersection
    expect(new Set(await titles()).size).toBe(5);
    expect(
      (await titles()).every((t) =>
        [...allowed, title(11), title(12)].includes(t),
      ),
    ).toBe(true);

    await tag('测试音').click();
    await tag('少量测试').click();
    await tag('空标签').click();
    await expect(rows).toHaveCount(0);
    await expect(
      page.getByText('这些标签暂时没有匹配歌曲，试试其他标签或搜索全曲库。'),
    ).toBeVisible();
    await expect(refresh).toBeDisabled();
    await tag('空标签').click();
    await expect(rows).toHaveCount(5);
    await refresh.click();
    await search.fill(chosen);
    await expect(rows.getByRole('combobox')).toHaveValue('familiar');

    await tag('保存偏好，进入大厅').click();
    await expect(tag('修改音乐偏好')).toBeVisible();
    const saved = await view(page, '/api/profile');
    expect(Object.keys(saved.profile.songEvidence)).toHaveLength(1);
    expect(
      Object.values(saved.profile.songEvidence)[0][0].recognitionLevel,
    ).toBe('familiar');
    await page.reload();
    await tag('修改音乐偏好').click();
    await search.fill(chosen);
    await expect(rows.getByRole('combobox')).toHaveValue('familiar');
    await search.fill('');
    await expect(rows).toHaveCount(5);

    for (const width of [360, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await refresh.scrollIntoViewIfNeeded();
      await expect(refresh).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const box = await refresh.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: testInfo.outputPath('suggestions-' + width + '.png'),
      });
    }
    expect(r.errors).toEqual([]);
  } finally {
    await r.close();
  }
});
