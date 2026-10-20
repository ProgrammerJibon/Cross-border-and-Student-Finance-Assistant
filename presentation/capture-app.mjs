import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('presentation/app-captures',{recursive:true});
const browser=await chromium.launch({headless:true,channel:"msedge"});
const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});
await page.goto('http://127.0.0.1:3000/en/demo',{waitUntil:'networkidle',timeout:180000});
await page.locator('.demo-profile').filter({has:page.getByRole('heading',{name:'Student',exact:true})}).click();
await page.waitForURL('**/dashboard',{timeout:120000});
for (const route of ['dashboard','tuition','budget']) {
 await page.goto('http://127.0.0.1:3000/en/'+route,{waitUntil:'networkidle',timeout:120000});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await page.locator('.main-content h1').first().waitFor();
 await page.locator('.main-content').screenshot({path:'presentation/app-captures/'+route+'.png'});
 if(route==='budget') await page.locator('.three-grid .card').filter({has:page.getByRole('heading',{name:'Shopping',exact:true})}).screenshot({path:'presentation/app-captures/shopping-card.png'});
 if(route==='tuition') await page.locator('.invoice-card').first().screenshot({path:'presentation/app-captures/invoice-card.png'});
 console.log('Captured',route);
}
await browser.close();

