export const QUICK_CAPTURE_COMMAND = 'open-quick-capture';

export function isQuickCaptureCommand(command: string) {
  return command === QUICK_CAPTURE_COMMAND;
}
