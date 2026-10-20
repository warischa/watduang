import run, { judge } from '/Users/waris.c/claude/free-game/scripts/play-top-band-probe.mjs';
const SELS = ['[data-ps=start]', '#tb-start', '#btn-begin-game', '#ruleReadyBtn', '#btn-ready-to-aim', '#btn-primary-action', '#dl-begin', '#btnStartGame', '#ready', '#startGameBtn', '#btn-start-match', '#btn-big-action', '#readyBtn', '#btn-start-game'];
const PLANT = `setInterval(()=>{for(const s of ${JSON.stringify(SELS)}){const b=document.querySelector(s);if(b&&!b.disabled)b.disabled=true;}},20);`;
export default async function (session) {
  await session.onNewDocument(PLANT);
  const out = await run(session);
  return { failures: judge(out), rows: out.rows.length };
}
