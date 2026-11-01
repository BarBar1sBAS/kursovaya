async page => {
  const results=[];
  await page.setViewportSize({width:1440,height:1000});
  for(const theme of ['light','dark']) {
    await page.evaluate(value=>{localStorage.setItem('warehouse.theme',value);location.reload();},theme);
    await page.locator('.radix-themes.'+theme).waitFor();
    const contrast=await page.evaluate(()=>{
      const root=document.querySelector('.radix-themes'),style=getComputedStyle(root);
      const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      const rgb=color=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3);};
      const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>{const l1=luminance(rgb(a)),l2=luminance(rgb(b));return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);};
      const value=name=>style.getPropertyValue('--'+name);
      const pairs=[['ink','surface'],['muted','surface'],['muted','canvas'],['muted','side'],['accent','accent-soft'],['error','error-bg'],['warning-ink','warning-bg'],['surface','accent']];
      return pairs.map(([text,background])=>({text,background,ratio:ratio(value(text),value(background))}));
    });
    // Dark solid buttons use a dark foreground, not --surface.
    const relevant=contrast.filter(p=>!(theme==='dark'&&p.text==='surface'&&p.background==='accent'));
    if(relevant.some(p=>p.ratio<4.5))throw Error(JSON.stringify({theme,contrast}));
    results.push({theme,contrast:relevant});
  }
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Horizontal page overflow');
  const navigation=await page.getByRole('navigation',{name:'Основные разделы'}).getByRole('link').all();
  for(const link of navigation){const box=await link.boundingBox();if(box.x<0||box.x+box.width>390)throw Error('Hidden navigation');}
  await page.emulateMedia({reducedMotion:'reduce'});
  const transition=await page.getByRole('link',{name:'Заказы',exact:true}).evaluate(e=>getComputedStyle(e).transitionDuration);
  if(transition!=='0s')throw Error('Reduced motion is not respected');
  await page.keyboard.press('Tab');
  return {passed:true,scope:'Main design token contrast, narrow navigation and reduced motion; not a full WCAG audit',results,overflow,transition};
}
