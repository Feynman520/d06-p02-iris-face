#!/usr/bin/env node
// IRIS-Face · © 2026 Sejun Ham (함세준) · MIT · https://feynman520.github.io/card/#home
// iris-update — 「대화로 업데이트」 대화의 에이전트가 IRIS 창에 말하는 명령.
// IRIS 창이 세션을 띄울 때 준 환경 변수(IRIS_UPDATE_URL · _SESSION · _KEY)로 이 PC 의 IRIS 창에만 말한다(바깥 연결 없음).
// 이 명령에 "적용"은 없다 — 적용은 사용자가 화면의 확인 카드에서 누른다.
const HELP = `iris-update — IRIS 업데이트를 대화로 돕는 명령 (IRIS 가 띄운 세션에서만 동작)

  iris-update status     지금 상태를 읽는다(아무것도 바꾸지 않음): 방식 · 지금 판 · 새 판과 달라진 점 · 받아 둔 것 ·
                         지난 결과 · 이 PC 에서 고친 파일 · 열려 있는 대화 · 최근 기록
  iris-update check      새 판이 있는지 지금 확인한다(인터넷 연결) — 끝나면 상태를 다시 보여 준다
  iris-update download   새 판을 내려받고 서명을 검증한다. 사용자가 업데이트하자고 한 뒤에만, 한 번만 부른다(길면 몇 분).
                         메신저처럼 창을 끄지 않고 바뀌는 부품은 이때 바로 바뀐다(대화는 끊기지 않는다).
                         IRIS 창 · 설치 패키지는 받아 두기만 한다 — 적용은 사용자가 누른다
  iris-update offer      사용자 화면에 「받아 둔 새 판을 지금 적용할까요?」 확인을 띄운다. 누르는 것은 사용자다

  적용은 이 명령으로 하지 않는다. 사용자가 확인 카드에서 「지금 적용」을 눌러야 적용된다
  (IRIS 창과 열려 있는 대화가 닫혔다가 창이 다시 켜진다 — 이 대화도 닫힌다).
`;
const WAIT_MS = { status: 20_000, check: 60_000, download: 15 * 60_000, offer: 20_000 };

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }
  if (!Object.prototype.hasOwnProperty.call(WAIT_MS, cmd)) { console.error(`모르는 명령: ${cmd}\n\n${HELP}`); return 2; }
  const url = process.env.IRIS_UPDATE_URL, sid = process.env.IRIS_UPDATE_SESSION, key = process.env.IRIS_UPDATE_KEY;
  if (!url || !sid || !key || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) { console.error('이 세션은 IRIS 창이 띄운 세션이 아니어서 업데이트 명령을 쓸 수 없습니다. 사용자에게 그대로 알려 주세요.'); return 3; }
  let res, out;
  try {
    res = await fetch(`${url}/api/update/cli`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-iris-session': sid, 'x-iris-key': key }, body: JSON.stringify({ cmd }), signal: AbortSignal.timeout(WAIT_MS[cmd]) });
    out = await res.json();
  } catch {
    // 보내는 중에 끊겼으면 됐는지 알 수 없다 — "안 됐다"고 단정하지 않는다
    console.error(cmd === 'status' ? 'IRIS 창에 닿지 못했습니다(창이 꺼져 있거나 다시 시작하는 중). 사용자에게 그대로 알려 주세요.'
      : 'IRIS 창에 닿지 못했거나 답을 받지 못했습니다. 됐는지 알 수 없습니다 — 다시 부르기 전에 iris-update status 로 확인하고, 사용자에게 그대로 알려 주세요.');
    return 4;
  }
  if (out && out.ok) { console.log(out.text); return 0; }
  console.error((out && out.text) || `하지 못했습니다(${res.status}).`);
  return 1;
}
main().then((code) => { process.exitCode = code; });
