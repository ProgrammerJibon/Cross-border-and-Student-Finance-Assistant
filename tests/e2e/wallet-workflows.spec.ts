import {test,expect} from '@playwright/test';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';

test('wallet modal, pending manual deposit, operator review and withdrawal cancellation',async({page})=>{
  test.setTimeout(120000);
  expect(process.env.DB_NAME).toMatch(/^finbridge_test_/);
  const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const suffix=randomUUID().slice(0,8),customer=`browser-wallet-${suffix}`,admin=`browser-admin-${suffix}`,password='BrowserFixture!2026';
  try{
    for(const [id,role] of [[customer,'STUDENT'],[admin,'ADMIN']]){
      await db.execute("INSERT INTO users(id,name,email,password_hash,role,is_demo,onboarded) VALUES (?,?,?,?,?,1,1)",[id,id,`${id}@example.test`,await bcrypt.hash(password,4),role]);
      await db.execute('INSERT INTO user_preferences(user_id) VALUES (?)',[id]);
      await db.execute("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'student',UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),id]);
    }
    await db.execute("INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Browser wallet','WALLET','CNY',100)",[`${customer}-wallet`,customer]);
    const login=async(id:string)=>{await page.context().clearCookies();await page.goto('/en/login');await page.getByRole('textbox',{name:'Email address',exact:true}).fill(`${id}@example.test`);await page.getByRole('textbox',{name:'Password',exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(id===admin?/\/admin$/:/\/dashboard$/);};
    await login(customer);await page.goto('/en/payments');
    await page.getByRole('button',{name:'Add money',exact:true}).first().click();
    let dialog=page.getByRole('dialog');
    await dialog.getByRole('spinbutton',{name:'Amount',exact:true}).fill('10');
    await dialog.getByRole('combobox',{name:'Deposit type'}).click();await page.getByRole('option',{name:'Manual',exact:true}).click();
    await dialog.getByRole('button',{name:'Next',exact:true}).click();
    await dialog.getByRole('combobox',{name:'Manual receiving accounts'}).click();await page.getByRole('option',{name:/UNIONPAY/}).click();
    await dialog.getByRole('textbox',{name:'Sender account name'}).fill(customer);
    await dialog.getByRole('textbox',{name:'Sender mobile / account identifier'}).fill('DEMO-SENDER');
    await dialog.getByRole('textbox',{name:'Transaction ID',exact:true}).fill(`fixture-${suffix}`);
    await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('cell',{name:'PENDING_VERIFICATION',exact:true})).toBeVisible();
    await login(admin);await page.goto('/en/admin/settlements');
    const row=page.getByRole('row').filter({has:page.getByRole('cell',{name:customer,exact:true})});
    await row.getByRole('button',{name:'Start review'}).click();
    await row.getByRole('button',{name:'Record settlement evidence'}).click();dialog=page.getByRole('dialog');
    await dialog.getByRole('textbox',{name:'External statement / settlement reference'}).fill('DEMO evidence fixture');
    await dialog.getByRole('combobox',{name:'Payee and amount checked'}).click();await page.getByRole('option',{name:'Yes',exact:true}).click();
    await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);
    await row.getByRole('button',{name:'Verify simulated settlement'}).click();await expect(row).toContainText('COMPLETED');
    await login(customer);await page.goto('/en/payments');
    await page.getByRole('button',{name:'Withdraw Money',exact:true}).click();dialog=page.getByRole('dialog');
    await dialog.getByRole('spinbutton',{name:'Amount',exact:true}).fill('5');
    await dialog.getByRole('combobox',{name:'Payment method',exact:true}).click();await page.getByRole('option',{name:'PayPal',exact:true}).click();
    await dialog.getByRole('textbox',{name:'Recipient account holder'}).fill(customer);
    await dialog.getByRole('textbox',{name:'Email address',exact:true}).fill('payee@example.test');
    await dialog.getByRole('button',{name:'Next',exact:true}).click();await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).toHaveCount(0);
    const withdrawal=page.getByRole('row').filter({has:page.getByRole('cell',{name:'WITHDRAWAL_MANUAL',exact:true})});
    await expect(withdrawal).toContainText('PENDING_REVIEW');await withdrawal.getByRole('button',{name:'Cancel',exact:true}).click();await expect(withdrawal).toContainText('CANCELLED');
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }finally{await db.end();}
});
