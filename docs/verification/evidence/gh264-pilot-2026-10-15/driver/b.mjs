import { connect } from './lib.mjs';
const s = await connect();
await s.send('Emulation.setDeviceMetricsOverride',{width:1800,height:1000,deviceScaleFactor:1,mobile:false});
await s.send('Page.navigate',{url:'file://'+process.argv[2]}); await s.sleep(4000);
console.log(await s.ev('return [document.documentElement.scrollHeight, document.documentElement.scrollWidth]'));
await s.shotFull(process.argv[3]); await s.close();
