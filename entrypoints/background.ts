export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.info('MochiNote extension installed.');
  });
});
