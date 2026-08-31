const form=document.getElementById('form');
const submitButton=document.getElementById('submit');
const formMessage=document.getElementById('form-message');
const loginNeeded=document.getElementById('login-needed');
const API=(typeof SUPABASE_CONFIG!=='undefined'&&SUPABASE_CONFIG.url)?SUPABASE_CONFIG.url:'https://nkxgnqzdswugbjjquxfj.supabase.co';
const SUBMIT_FN=API+'/functions/v1/submit-feedback';
const PUBLISHABLE_KEY=(typeof SUPABASE_CONFIG!=='undefined'&&SUPABASE_CONFIG.publishableKey)?SUPABASE_CONFIG.publishableKey:'sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF';

function readCaptchaToken(){
  const input=document.querySelector('[name="cf-turnstile-response"]');
  if(input&&input.value)return input.value.trim();
  if(window.__turnstileToken)return String(window.__turnstileToken).trim();
  return '';
}

(async()=>{
  const auth=window.UtiloraAuth;
  if(!auth){
    location.href='../login/?next='+encodeURIComponent('../feedback/');
    return;
  }
  const session=await auth.refreshIfNeeded();
  if(!session){
    location.href='../login/?next='+encodeURIComponent('../feedback/');
    return;
  }
  if(loginNeeded) loginNeeded.hidden=true;
  form.hidden=false;
  const user=session.user||{};
  const nameInput=document.getElementById('name');
  const contactInput=document.getElementById('contact');
  if(nameInput&&!nameInput.value) nameInput.value=auth.displayName(user);
  if(contactInput&&!contactInput.value) contactInput.value=user.email||'';

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(document.getElementById('website').value)return;

    formMessage.className='message';
    formMessage.textContent='正在提交……';
    submitButton.disabled=true;

    try{
      const live=await auth.refreshIfNeeded();
      if(!live||!live.access_token){
        location.href='../login/?next='+encodeURIComponent('../feedback/');
        return;
      }
      const response=await fetch(SUBMIT_FN,{
        method:'POST',
        credentials:'omit',
        cache:'no-store',
        headers:{
          apikey:PUBLISHABLE_KEY,
          Authorization:'Bearer '+live.access_token,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          captcha_token:readCaptchaToken(),
          name:document.getElementById('name').value.trim(),
          title:document.getElementById('title').value.trim(),
          message:document.getElementById('detail').value.trim(),
          contact:document.getElementById('contact').value.trim()||null
        })
      });
      const data=await response.json().catch(()=>({}));
      if(response.status===401){
        location.href='../login/?next='+encodeURIComponent('../feedback/');
        return;
      }
      if(!response.ok){
        const raw=data.message||data.error||('HTTP '+response.status);
        throw new Error(auth.friendlyError({message:raw,code:data.error},raw));
      }

      form.reset();
      if(nameInput) nameInput.value=auth.displayName(live.user);
      if(contactInput) contactInput.value=live.user?.email||'';
      formMessage.textContent='提交成功，感谢你的建议！';
    }catch(error){
      formMessage.className='message error';
      formMessage.textContent=`提交失败：${error.message}，请稍后重试。`;
    }finally{
      submitButton.disabled=false;
    }
  });
})();
