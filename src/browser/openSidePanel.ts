export async function openSidePanel() {
  if (!browser.sidePanel) {
    return false;
  }

  await browser.sidePanel.open({
    windowId: browser.windows.WINDOW_ID_CURRENT,
  });
  return true;
}
