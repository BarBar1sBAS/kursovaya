// Run against a separate, empty 1C base connected to the real bridge. No response mocks.
async (page) => {
  const origin='http://127.0.0.1:4318';
  const suffix=String(Date.now());
  const productName='Кабель USB (браузер '+suffix+')', clientName='Учебный клиент (браузер '+suffix+')', warehouseA='Склад А (браузер '+suffix+')', warehouseB='Склад Б (браузер '+suffix+')';
  const checks=[];const snapshots=[];
  const check=(value,message)=>{if(!value)throw Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.unroute('**/api/v1/**');
  await page.goto(origin);await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByText('1С подключена',{exact:true}).waitFor();
  const go=async path=>{await page.goto(origin+'/#/'+path);await page.getByText('1С подключена',{exact:true}).waitFor();};
  async function save(entity) {
    await page.getByRole('button',{name:'Сохранить',exact:true}).click();
    await page.waitForURL(new RegExp('#/'+entity+'/[0-9a-f-]{36}$'));
    return page.url().split('/').at(-1);
  }
  async function catalog(entity,fields) {
    await go(entity+'/new');
    for(const [label,value]of Object.entries(fields))await page.getByLabel(label,{exact:true}).fill(value);
    return save(entity);
  }
  const product=await catalog('products',{'Наименование':productName,'Артикул':'USB-WEB','Единица измерения':'шт.'});
  const client=await catalog('clients',{'Наименование':clientName});
  const a=await catalog('warehouses',{'Наименование':warehouseA});
  const b=await catalog('warehouses',{'Наименование':warehouseB});
  async function state(name,expected) {
    await go('reports');
    await page.getByRole('option',{name:productName,exact:true}).waitFor({state:'attached'});
    await page.getByLabel('Товар',{exact:true}).selectOption(product);
    await page.getByRole('button',{name:'Сформировать',exact:true}).click();
    if(name==='S0') await page.getByRole('heading',{name:'Нет данных для отчёта'}).waitFor();
    else {
      await page.getByRole('cell',{name:warehouseA,exact:true}).waitFor();
      for(const [warehouse,values]of [[warehouseA,expected[0]],[warehouseB,expected[1]]]) {
        await page.waitForFunction(({warehouse,values}) => Array.from(document.querySelectorAll('tbody tr')).some(row => {
          const cells=Array.from(row.querySelectorAll('td')).map(cell=>cell.textContent);
          const actual=cells.slice(-3).map(v=>Number(v.replace(/\s/g,'').replace(',','.')));
          return cells.includes(warehouse)&&JSON.stringify(actual)===JSON.stringify(values);
        }),{warehouse,values});
      }
    }
    snapshots.push({name,text:await page.locator('main').innerText()});checks.push(name);
  }
  async function line(index,warehouse,quantity,price) {
    await page.getByLabel(`Товар, строка ${index}`,{exact:true}).selectOption(product);
    await page.getByLabel(`Склад, строка ${index}`,{exact:true}).selectOption(warehouse);
    await page.getByLabel(`Количество, строка ${index}`,{exact:true}).fill(quantity);
    if(price)await page.getByLabel(`Цена, строка ${index}`,{exact:true}).fill(price);
  }
  async function post(){await page.getByRole('button',{name:'Провести',exact:true}).click();await page.getByRole('button',{name:'Отменить проведение',exact:true}).waitFor();}
  await state('S0',[]);
  await go('receipts/new');await line(1,a,'10');await page.getByRole('button',{name:'Добавить строку',exact:true}).click();await line(2,b,'8');await save('receipts');await post();await state('S1',[[10,0,10],[8,0,8]]);
  await go('orders/new');await page.getByLabel('Клиент',{exact:true}).selectOption(client);await line(1,a,'6','100');await page.getByRole('button',{name:'Добавить строку',exact:true}).click();await line(2,b,'5','100');const order=await save('orders');await post();await state('S2',[[10,6,4],[8,5,3]]);
  await go('orders/new');await page.getByLabel('Клиент',{exact:true}).selectOption(client);await line(1,a,'1','100');await page.getByRole('button',{name:'Добавить строку',exact:true}).click();await line(2,b,'4','100');await save('orders');await page.getByRole('button',{name:'Провести',exact:true}).click();await page.getByRole('alert').filter({hasText:'Недостаточно доступного товара'}).waitFor();
  check(await page.getByLabel('Количество, строка 2',{exact:true}).getAttribute('aria-invalid')==='true','Error is not attached to row 2');checks.push('Дефицит и ошибка строки');await state('Отказ',[[10,6,4],[8,5,3]]);
  async function shipment(first) {
    await go('orders/'+order);await page.getByRole('link',{name:'Создать отгрузку',exact:true}).click();
    await page.getByRole('button',{name:'Подобрать из заказа',exact:true}).click();
    await page.getByLabel('Количество, строка 2',{exact:true}).waitFor();
    await page.getByRole('option',{name:warehouseA,exact:true}).first().waitFor({state:'attached'});
    if(first){
      for(let i=1;i<=2;i++){const wh=await page.getByLabel(`Склад, строка ${i}`,{exact:true}).inputValue();await page.getByLabel(`Количество, строка ${i}`,{exact:true}).fill(wh===a?'2':'3');}
    }
    const id=await save('shipments');await post();return id;
  }
  await shipment(true);await state('S3',[[8,4,4],[5,2,3]]);
  await go('orders/'+order);await page.getByRole('button',{name:'Отменить проведение',exact:true}).click();await page.getByRole('alert').filter({hasText:'Сначала отмените проведение'}).waitFor();checks.push('Зависимость отмены');
  await shipment(false);await state('S4',[[4,0,4],[3,0,3]]);
  await page.getByRole('tab',{name:'Выполнение заказов',exact:true}).click();
  await page.getByRole('option',{name:clientName,exact:true}).waitFor({state:'attached'});await page.getByLabel('Клиент',{exact:true}).selectOption(client);await page.getByRole('button',{name:'Сформировать',exact:true}).click();
  await page.getByRole('cell',{name:'Отгружен',exact:true}).first().waitFor();checks.push('Выполнение заказа');
  check(errors.length===0,errors.join('\n'));
  return {passed:true,scope:'Настоящий UI → Node → открытый сеанс 1С, без перехвата API',order,checks,snapshots,errors};
}
