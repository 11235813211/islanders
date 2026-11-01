import { expect, test } from '@playwright/test';
import { getView } from '../shared/engine';
import { richGame, grant } from './fixtures';
import { mountGame } from './ui-harness';

test('map confirmation cancels outside, toolbar roads and cities build immediately',async({page})=>{
  const game=await mountGame(page,richGame());
  const roads=Object.keys(game.state().roads).length;
  await page.getByRole('button',{name:/^Build road at/}).first().click();
  await expect(page.getByRole('button',{name:'Confirm road',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Cancel placement'})).toHaveCount(0);
  await page.locator('.turn-clock').click();
  await expect(page.locator('.map-confirm')).toHaveCount(0);expect(Object.keys(game.state().roads)).toHaveLength(roads);
  await page.getByRole('button',{name:'Build road',exact:true}).click();
  await page.getByRole('button',{name:/^Build road at/}).first().click();
  await expect.poll(()=>Object.keys(game.state().roads).length).toBe(roads+1);
  await expect(page.locator('.map-confirm')).toHaveCount(0);
  await page.getByRole('button',{name:'Build city',exact:true}).click();
  await page.getByRole('button',{name:/^Upgrade to city at/}).first().click();
  await expect.poll(()=>Object.values(game.state().buildings).filter(b=>b.kind==='city').length).toBe(1);
  await expect(page.locator('.map-confirm')).toHaveCount(0);expect(game.errors).toEqual([]);
});

test('private totals, empty dev piles, player-colored build pieces and colored recipes',async({page})=>{
  const initial=richGame();initial.players[0].development=[{id:'vp',kind:'victory-point',boughtTurn:0}];
  await mountGame(page,initial);await page.getByLabel('Follow current turn').uncheck();
  const own=page.getByRole('row',{name:'Player 0, you',exact:true});
  await expect(own.locator('.points')).toHaveText('2 (3)');
  await expect(page.getByRole('row',{name:'Player 1',exact:true}).locator('.stat-dev')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Buy development card'})).toContainText('Dev Card');
  const build=page.getByRole('button',{name:'Build city',exact:true});
  await expect(build.locator('svg')).toHaveCSS('color','rgb(237, 88, 49)');
  await build.hover();
  await expect(page.getByRole('tooltip').filter({hasText:'Build city'}).locator('.resource-icon')).toHaveCount(5);
  await expect(page.locator('.board-harbor .resource-icon')).toHaveCount(5);
  const fills=await page.locator('.board-harbor .resource-icon').evaluateAll(icons=>icons.map(icon=>[...icon.querySelectorAll('[fill]')].map(node=>node.getAttribute('fill'))));
  expect(new Set(fills.flat()).size).toBeGreaterThan(10);
  await page.getByLabel('Play as',{exact:true}).selectOption('p1');
  await expect(page.getByRole('row',{name:'Player 0',exact:true}).locator('.points')).toHaveText('2');
  await expect(page.locator('.development-pile')).toHaveCount(0);
  await expect(build.locator('svg')).toHaveCSS('color','rgb(22, 127, 206)');
});

test('trade stays beside the hand, collects hand clicks and supports bank exchanges on every viewport',async({page})=>{
  const initial=richGame(),game=await mountGame(page,initial);
  await page.getByRole('button',{name:/^Trade Lumber/}).click();
  await page.getByRole('button',{name:/^Trade Lumber/}).click();
  await page.getByRole('button',{name:/^Trade Brick/}).click();
  const dialog=page.getByRole('dialog',{name:'Trade resources'});
  await expect(dialog.getByRole('button',{name:'Remove one Lumber from give'})).toHaveText('2');
  await expect(dialog.getByRole('button',{name:'Remove one Brick from give'})).toHaveText('1');
  await dialog.getByRole('button',{name:'Request one more Ore'}).click();
  await dialog.getByRole('button',{name:'Request one more Grain'}).click();
  for(const [width,height,label] of [[1440,900,'desktop'],[390,844,'phone'],[390,667,'small-phone'],[844,390,'landscape'],[667,375,'small-landscape']] as const){
    await page.setViewportSize({width,height});
    const box=(await dialog.boundingBox())!,board=(await page.locator('.board-viewport').boundingBox())!;
    expect(box.x-board.x).toBeLessThan(10);expect(box.y+box.height).toBeLessThanOrEqual(board.y+board.height);expect(box.y).toBeGreaterThanOrEqual(board.y);
    await expect(dialog.getByRole('button',{name:'Send offer'})).toBeInViewport();
    await page.screenshot({path:`test-results/trading-${label}.png`});
  }
  await dialog.getByRole('button',{name:'Send offer'}).click();
  await expect.poll(()=>game.state().tradeOffer?.give.wood).toBe(2);expect(game.state().tradeOffer?.give.brick).toBe(1);
  expect(game.state().tradeOffer?.want).toMatchObject({ore:1,wheat:1});
  await page.getByRole('button',{name:'Withdraw offer'}).click();
  await page.getByRole('button',{name:/^Trade Lumber/}).click();await dialog.getByRole('button',{name:'Bank',exact:true}).click();
  await dialog.getByRole('button',{name:'Request one more Ore'}).click();
  const before=game.state().players[0].resources.wood,rate=getView(game.state(),'p0').tradeRates.wood;
  await expect(dialog.getByRole('button',{name:'Remove one Lumber from give'})).toHaveText(String(rate));
  await dialog.getByRole('button',{name:'Exchange',exact:true}).click();
  await expect.poll(()=>game.state().players[0].resources.wood).toBe(before-rate);expect(game.errors).toEqual([]);
});

test('victim selection uses readable player-colored cards inside the board',async({page})=>{
  const g=richGame();g.phase='steal';g.buildings={};const hex=g.board.hexes[0];g.robber=hex.id;
  g.buildings[hex.vertexIds[0]]={playerId:'p1',kind:'settlement'};g.buildings[hex.vertexIds[3]]={playerId:'p2',kind:'settlement'};
  grant(g,'p1',{ore:1});grant(g,'p2',{ore:2});
  const game=await mountGame(page,g);const chooser=page.getByRole('region',{name:'Choose a player to steal from'});
  await expect(chooser).toBeVisible();const blue=chooser.getByRole('button',{name:'Steal from Player 1'});
  await expect(blue).toHaveCSS('border-top-color','rgb(22, 127, 206)');
  await expect(chooser.getByRole('button',{name:'Steal from Player 2'})).toHaveCSS('border-top-color','rgb(223, 170, 11)');
  await page.setViewportSize({width:390,height:667});await page.screenshot({path:'test-results/steal-phone.png'});
  await blue.click();await expect.poll(()=>game.state().phase).toBe('build');expect(game.errors).toEqual([]);
});

test('pause proposals show individual yes, pending and no votes and permit a new proposal',async({page})=>{
  await mountGame(page,richGame());await page.getByLabel('Follow current turn').uncheck();
  await page.getByRole('button',{name:'Propose pause',exact:true}).click();
  await expect(page.getByLabel('Player 0: yes',{exact:true})).toBeVisible();await expect(page.getByLabel('Player 1: not yet approved',{exact:true})).toBeVisible();
  await page.getByLabel('Play as',{exact:true}).selectOption('p1');await page.getByRole('button',{name:'Reject proposal'}).click();
  await expect(page.getByLabel('Player 1: no',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Propose pause',exact:true}).click();await expect(page.getByLabel('Player 1: yes',{exact:true})).toBeVisible();
});

test('releasing outside the board or canceling touch never leaves a stale drag',async({page})=>{
  const game=await mountGame(page,richGame());const board=page.locator('.board-viewport'),svg=page.locator('.board-svg');
  const box=(await board.boundingBox())!;
  await page.mouse.move(box.x+20,box.y+40);await page.mouse.down();await page.mouse.move(box.x+box.width+40,box.y+60);await page.mouse.up();
  await page.getByRole('button',{name:'Reset board view'}).click();const reset=await svg.getAttribute('viewBox');
  await page.mouse.move(box.x+50,box.y+50);await expect(svg).toHaveAttribute('viewBox',reset!);
  const touch=await page.context().newCDPSession(page);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-40,y,id:1},{x:x+40,y,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-70,y,id:1},{x:x+70,y,id:2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
  await page.getByRole('button',{name:'Reset board view'}).click();await page.mouse.move(x+30,y+30);
  await expect(svg).toHaveAttribute('viewBox',reset!);
  await page.getByRole('button',{name:/^Build road at/}).first().click();await expect(page.getByRole('button',{name:'Confirm road',exact:true})).toBeVisible();expect(game.errors).toEqual([]);
});
