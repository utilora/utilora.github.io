const form=document.getElementById('form');
const submitButton=document.getElementById('submit');
const formMessage=document.getElementById('form-message');
const CAPTCHA_FN=(typeof SUPABASE_CONFIG!=='undefined'&&SUPABASE_CONFIG.url?SUPABASE_CONFIG.url:'https://nkxgnqzdswugbjjquxfj.supabase.co')+'/functions/v1/verify-captcha';
const PUBLISHABLE_KEY=(typeof SUPABASE_CONFIG!=='undefined'&&SUPABASE_CONFIG.publishableKey)?SUPABASE_CONFIG.publishableKey:'sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF';

function readCaptchaToken(){
  const input=document.querySelector('[name="cf-turnstile-response"]');
  if(input&&input.value)return input.value.trim();
  if(window.__turnstileToken)return String(window.__turnstileToken).trim();
  return '';
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(document.getElementById('website').value)return;

  formMessage.className='message';
  formMessage.textContent='正在提交……';
  submitButton.disabled=true;

  const payload={
    name:document.getElementById('name').value.trim(),
    title:document.getElementById('title').value.trim(),
    message:document.getElementById('detail').value.trim(),
    contact:document.getElementById('contact').value.trim()||null
  };

  try{
    const captchaToken=readCaptchaToken();
    const captchaRes=await fetch(CAPTCHA_FN,{
      method:'POST',
      credentials:'omit',
      cache:'no-store',
      headers:{
        apikey:PUBLISHABLE_KEY,
        Authorization:'Bearer '+PUBLISHABLE_KEY,
        'Content-Type':'application/json'
      },
      body:JSON.stringify({action:'verify',token:captchaToken,purpose:'feedback'})
    });
    const captchaData=await captchaRes.json().catch(()=>({}));
    if(!captchaData.skipped&&(!captchaRes.ok||captchaData.allowed===false)){
      throw new Error(captchaData.message||'请完成人机验证后再提交。');
    }

    const response=await fetch(`${SUPABASE_CONFIG.url}/rest/v1/feedback`,{
      method:'POST',
      headers:{
        apikey:SUPABASE_CONFIG.publishableKey,
        Authorization:`Bearer ${SUPABASE_CONFIG.publishableKey}`,
        'Content-Type':'application/json',
        Prefer:'return=minimal'
      },
      body:JSON.stringify(payload)
    });

    if(!response.ok){
      const error=await response.json().catch(()=>({}));
      throw new Error(error.message||`HTTP ${response.status}`);
    }

    form.reset();
    formMessage.textContent='提交成功，感谢你的建议！';
  }catch(error){
    formMessage.className='message error';
    formMessage.textContent=`提交失败：${error.message}，请稍后重试。`;
  }finally{
    submitButton.disabled=false;
  }
});
