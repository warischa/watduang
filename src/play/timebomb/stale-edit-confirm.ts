// gh#295 A2 (d). The shared player screen's mid-round confirm (ADR-0071 ruling 6) asks whether to end
// the round in progress, and offers "เล่นรอบนี้ต่อ" to keep it. The fuse does not stop for the
// question, so the bomb can go off underneath it -- and the dialog then offered to keep playing a
// round that was already over. The route closes it the moment the boom screen appears.
//
// The close is a REVEAL (ADR-0057): the boom screen and the route header come out from under the
// dialog while a finger may be on its way to one of the dialog's answers. So the closer arms through
// the screen's own gate (PlayerScreen.arm, which covers the whole game root), not a route gate of its
// own. The dialog's own close listener also arms, but the browser fires that event in a later task;
// this arm is synchronous with the close.
//
// Its own module, not inline in main.ts, so arm-reveal-paths.test.mjs can drive the real bytes over
// the real shared screen and this route's markup.

/** Closes the mid-round confirm if it is open, then re-arms what the close uncovered. Returns whether
 *  there was anything to close: with no dialog up nothing is revealed, and nothing is armed. */
export function closeStaleEditConfirm(doc: Document, rearm: () => void): boolean {
  const dialog = doc.getElementById('ps-edit-dialog') as HTMLDialogElement | null;
  if (!dialog || !dialog.open) return false;
  dialog.close();
  rearm();
  return true;
}
