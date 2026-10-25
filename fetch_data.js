// fetch_data.js
const fs = require('fs');

const CAMERAS = ['RNG01', 'RNG02', 'RNG03', 'RNG04', 'RNG05'];

async function fetchAllData() {
  console.log('--- เริ่มต้นดึงข้อมูล ---');

  // ==========================================
  // 1. ดึงข้อมูลระดับน้ำ (จาก ปภ.)
  // ==========================================
  let waterResults = {};
  for (const code of CAMERAS) {
    try {
      const res = await fetch('https://cctv.disaster.go.th/api/v1/stations/' + code);
      if (res.ok) {
        const d = await res.json();
        const level = d.currentWaterLevel != null ? d.currentWaterLevel : (d.waterLevel ? d.waterLevel.current : null);
        const bank = d.riverBankLevel != null ? d.riverBankLevel : (d.waterThreshold ? d.waterThreshold.bankLevel : null);
        waterResults[code] = { level, bank };
      }
    } catch (e) {
      console.log('Error fetching water level', code);
    }
  }
  fs.writeFileSync('water_levels.json', JSON.stringify(waterResults, null, 2));
  console.log('✅ บันทึกไฟล์ water_levels.json สำเร็จ');

  // ==========================================
  // 2. ดึงข้อมูลสถานีวัดฝน (ผ่าน Cloudflare Worker)
  // ==========================================
  let kraburiStations = [];
  try {
    const now = new Date();
    const thaiTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    
    // ปัดนาทีลงให้เป็นรอบ 15 นาที
    const roundedMinutes = Math.floor(thaiTime.getMinutes() / 15) * 15;
    thaiTime.setMinutes(roundedMinutes, 0, 0); 
    
    const dateStr = thaiTime.toISOString().slice(0, 10);
    const timeStr = thaiTime.toISOString().slice(11, 16); 
    
    const originalUrl = `https://clpp-radar.onwr.go.th/api/rain_stations?radar_date=${dateStr}&radar_time=${encodeURIComponent(timeStr)}`;
    
    const myWorkerUrl = 'https://ddpm-proxy.2ramrome.workers.dev'; 
    
    const proxyUrl = `${myWorkerUrl}/?url=${encodeURIComponent(originalUrl)}`;

    console.log('Fetching rain data via Proxy:', timeStr);
    const res = await fetch(proxyUrl);
    
    if (res.ok) {
      const textData = await res.text();
      let rawData = JSON.parse(textData);
      
      // ตรวจสอบว่า API ส่งมาเป็น Array หรือไม่
      let stationsArray = null;
      if (Array.isArray(rawData)) {
        stationsArray = rawData;
      } else if (rawData && Array.isArray(rawData.data)) {
        // บาง API อาจจะครอบข้อมูลมาอีกชั้น
        stationsArray = rawData.data;
      }

      if (stationsArray) {
        kraburiStations = stationsArray
          .filter(stn => {
            for(let i=0; i<stn.length; i++) {
                if (typeof stn[i] === 'string' && stn[i].includes('กระบุรี')) return true;
            }
            return false;
          })
          .map(stn => ({
            id: stn[0], lat: stn[1], lon: stn[2], name: stn[3],
            agency: stn[4], location: stn[5], rain1h: stn[6], rain24h: stn[10]
          }));
          
        console.log(`✅ พบสถานีวัดฝน อ.กระบุรี: ${kraburiStations.length} สถานี`);
      } else {
        // ถ้าไม่ใช่ Array ให้โชว์ข้อมูลที่ได้มา เพื่อดูว่า API ตอบอะไรกลับมา
        console.log('⚠️ รูปแบบข้อมูลไม่ใช่ Array (อาจจะยังไม่มีข้อมูลในรอบนี้):');
        console.log(JSON.stringify(rawData).substring(0, 300)); 
      }
    } else {
      console.log('❌ Rain API ตอบกลับด้วย Status:', res.status);
    }
  } catch (e) {
    console.log('❌ เกิดข้อผิดพลาดในการดึงข้อมูลฝน:', e.message);
  } finally {
    fs.writeFileSync('rain_stations.json', JSON.stringify(kraburiStations, null, 2));
    console.log('✅ บันทึกไฟล์ rain_stations.json สำเร็จ');
  }
}

fetchAllData();
