const fs = require('fs');

async function test() {
    const code = fs.readFileSync('js/levels/b2.config.js', 'utf8');
    
    // We can evaluate or parse it, but let's just find the max match first
    const maxUnitMatch = code.match(/\"(\d+)\|\|/g);
    if (maxUnitMatch) {
       const nums = maxUnitMatch.map(m => parseInt(m.split('|')[0].replace('\"', '')));
       console.log('Max in raw data strings:', Math.max(...nums));
       console.log('Total unique keys:', new Set(nums).size);
    }
}
test();
