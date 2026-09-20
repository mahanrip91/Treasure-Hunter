const SUPABASE_URL="https://lscynuqzocuvqrdqigoo.supabase.co";
const SUPABASE_KEY="sb_publishable__nK_y3ycShuXlzWI0_obCQ_ULYuvMmH";

const {createClient}=supabase;
const db=createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true
  }
});

const $=id=>document.getElementById(id);

let session=null;
let profile=null;
let game=null;
let target=null;
let watchId=null;
let lastPosition=null;
let currentHeading=0;

function toast(text){
  const t=$("toast");
  t.textContent=text;
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),3000);
}

function status(text){
  $("authStatus").textContent=text;
}

function setPage(name){
  document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));
  const p=$(name+"Page");
  if(p)p.classList.add("active");
  $("drawer").classList.remove("open");
}

function authEmail(username){
  return `${username.toLowerCase()}@username.treasure-hunter.invalid`;
}

function validUsername(u){
  return /^[A-Za-z0-9_]{3,24}$/.test(u);
}

function haversine(a,b,c,d){
  const R=6371000;
  const x=(c-a)*Math.PI/180;
  const y=(d-b)*Math.PI/180;
  const q=Math.sin(x/2)**2+
    Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;
  return R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
}

function bearing(a,b,c,d){
  const p1=a*Math.PI/180,p2=c*Math.PI/180;
  const dl=(d-b)*Math.PI/180;
  const y=Math.sin(dl)*Math.cos(p2);
  const x=Math.cos(p1)*Math.sin(p2)-
    Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}

function randomAround(lat,lon,min,max){
  const angle=Math.random()*Math.PI*2;
  const dist=min+Math.random()*(max-min);
  const dLat=(dist*Math.cos(angle))/111320;
  const dLon=(dist*Math.sin(angle))/(111320*Math.cos(lat*Math.PI/180));
  return {lat:lat+dLat,lon:lon+dLon};
}

function setText(id,text){
  const x=$(id);
  if(x)x.textContent=text;
}

async function loadProfile(){
  if(!session)return;

  const {data,error}=await db
    .from("profiles")
    .select("*")
    .eq("id",session.user.id)
    .single();

  if(error){
    console.error(error);
    toast("خطا در دریافت پروفایل");
    return;
  }

  profile=data;
  updateUI();
}

function updateUI(){
  if(!profile)return;

  setText("welcomeName",profile.username);
  setText("drawerUsername",profile.username);
  setText("drawerCoins","🪙 "+Number(profile.coins).toLocaleString());
  setText("dashCoins",Number(profile.coins).toLocaleString());
  setText("dashDistance",formatDistance(profile.distance_m));
  setText("dashTreasures",profile.treasures_count);
  setText("dashEarned",Number(profile.total_earned).toLocaleString());

  $("accountUsername").value=profile.username||"";
  $("accountEmail").value=session.user.email?.includes("@username.treasure-hunter.invalid")
    ? "ایمیل ثبت نشده"
    : (session.user.email||"");

  document.body.classList.toggle("light",profile.theme==="light");
}

function formatDistance(m){
  if(m<1000)return Math.round(m)+" m";
  return (m/1000).toFixed(2)+" km";
}

async function signup(){
  const u=$("signupUsername").value.trim();
  const p=$("signupPassword").value;
  const p2=$("signupPassword2").value;
  const email=$("signupEmail").value.trim();

  if(!validUsername(u))
    return status("یوزرنیم باید ۳ تا ۲۴ کاراکتر و فقط شامل حروف انگلیسی، عدد یا _ باشد.");

  if(p.length<6)
    return status("رمز عبور باید حداقل ۶ کاراکتر باشد.");

  if(p!==p2)
    return status("تکرار رمز عبور با رمز اصلی یکی نیست.");

  status("در حال ساخت حساب...");

  /*
   * Supabase Auth needs an email/phone for password auth.
   * When the user doesn't provide an email we use a private synthetic
   * address. The real email is stored only when supplied.
   */
  const authMail=email||authEmail(u);

  const {data,error}=await db.auth.signUp({
    email:authMail,
    password:p,
    options:{
      data:{
        username:u,
        real_email:email||null
      },
      emailRedirectTo:location.origin+location.pathname
    }
  });

  if(error){
    console.error(error);
    return status(error.message);
  }

  if(!data.user)
    return status("ساخت حساب انجام نشد.");

  if(!data.session){
    status("حساب ساخته شد. اگر تأیید ایمیل فعال باشد، ایمیل تأیید را باز کن.");
    toast("حساب ساخته شد ✨");
    return;
  }

  session=data.session;
  await loadProfile();
  showApp();
}

async function login(){
  const u=$("loginUsername").value.trim();
  const p=$("loginPassword").value;

  if(!validUsername(u))
    return status("یوزرنیم معتبر نیست.");

  status("در حال ورود...");

  const {data,error}=await db.auth.signInWithPassword({
    email:authEmail(u),
    password:p
  });

  if(error){
    console.error(error);
    return status("یوزرنیم یا رمز عبور اشتباه است.");
  }

  session=data.session;
  await loadProfile();
  showApp();
}

async function googleLogin(){
  status("در حال انتقال به Google...");

  const {error}=await db.auth.signInWithOAuth({
    provider:"google",
    options:{
      redirectTo:location.origin+location.pathname
    }
  });

  if(error){
    console.error(error);
    status(error.message);
  }
}

async function recovery(){
  const email=$("recoveryEmail").value.trim();

  if(!email)return status("ایمیل حسابت رو وارد کن.");

  status("در حال ارسال لینک...");

  const {error}=await db.auth.resetPasswordForEmail(email,{
    redirectTo:location.origin+location.pathname+"?reset=1"
  });

  if(error){
    console.error(error);
    return status(error.message);
  }

  status("لینک بازیابی ارسال شد 📩");
}

async function createGame(){
  if(!session)return;

  if(!navigator.geolocation){
    toast("مرورگرت موقعیت مکانی را پشتیبانی نمی‌کند.");
    return;
  }

  toast("در حال پیدا کردن منطقه شکار...");

  navigator.geolocation.getCurrentPosition(
    async pos=>{
      const lat=pos.coords.latitude;
      const lon=pos.coords.longitude;

      const {data:old}=await db
        .from("game_state")
        .select("*")
        .eq("user_id",session.user.id)
        .maybeSingle();

      if(old){
        game=old;
      }else{
        const seed=Math.floor(Math.random()*2147483647);

        const {data,error}=await db
          .from("game_state")
          .insert({
            user_id:session.user.id,
            center_lat:lat,
            center_lon:lon,
            cashout_radius_m:250,
            seed
          })
          .select()
          .single();

        if(error){
          console.error(error);
          return toast("ساخت منطقه شکار ناموفق بود.");
        }

        game=data;

        const treasures=[];

        for(let i=1;i<=8;i++){
          const x=randomAround(lat,lon,80+i*25,450+i*35);

          treasures.push({
            user_id:session.user.id,
            sequence:i,
            latitude:x.lat,
            longitude:x.lon,
            radius_m:38,
            reward:50+(i*25)
          });
        }

        const {error:te}=await db.from("treasures").insert(treasures);

        if(te){
          console.error(te);
          return toast("ساخت گنج‌ها ناموفق بود.");
        }
      }

      startTracking();
      await loadNextTreasure();
      setPage("game");
    },
    err=>{
      console.error(err);
      toast("برای شروع شکار اجازه موقعیت مکانی را بده.");
    },
    {
      enableHighAccuracy:true,
      timeout:15000,
      maximumAge:0
    }
  );
}

function startTracking(){
  if(watchId!==null)return;

  watchId=navigator.geolocation.watchPosition(
    async pos=>{
      const p=pos.coords;

      if(lastPosition){
        const d=haversine(
          lastPosition.latitude,
          lastPosition.longitude,
          p.latitude,
          p.longitude
        );

        if(d>2&&d<300){
          await db.rpc("add_distance",{p_meters:d});
        }
      }

      lastPosition=p;

      if(target)updateTarget(p.latitude,p.longitude);
    },
    err=>console.error(err),
    {
      enableHighAccuracy:true,
      maximumAge:5000,
      timeout:15000
    }
  );
}

async function loadNextTreasure(){
  const {data,error}=await db
    .from("treasures")
    .select("*")
    .eq("user_id",session.user.id)
    .eq("found",false)
    .order("sequence",{ascending:true})
    .limit(1)
    .maybeSingle();

  if(error){
    console.error(error);
    return toast("خطا در دریافت گنج.");
  }

  target=data;

  if(!target){
    setText("treasureTitle","همه گنج‌ها پیدا شدن! 🏆");
    setText("targetDistance","منطقه پاکسازی شد");
    setText("targetHint","به‌زودی منطقه جدید باز می‌شود.");
    $("scanBtn").disabled=true;
    return;
  }

  $("scanBtn").disabled=false;
  setText("treasureTitle","گنج شماره "+target.sequence);

  if(lastPosition)
    updateTarget(lastPosition.latitude,lastPosition.longitude);
}

function updateTarget(lat,lon){
  if(!target)return;

  const d=haversine(lat,lon,target.latitude,target.longitude);
  const b=bearing(lat,lon,target.latitude,target.longitude);

  setText("targetDistance",Math.round(d)+" متر تا گنج");
  setText("gameDistance",Math.round(d)+" m");

  const noisy=(b+((target.sequence*47)%35)-17+360)%360;
  $("compass").style.transform=`rotate(${noisy}deg)`;

  if(d<=target.radius_m+15){
    setText("targetHint","🔥 خیلی نزدیکی! دوباره شناسایی کن.");
  }else if(d<100){
    setText("targetHint","👀 نزدیک شدی... اطراف رو دقیق نگاه کن.");
  }else if(d<250){
    setText("targetHint","🧭 مسیر خوبه؛ ولی قطب‌نما هنوز کمی منحرفه.");
  }else{
    setText("targetHint","🚶 ادامه بده. مسیر رو با آزمون و خطا پیدا کن.");
  }
}

async function scan(){
  if(!target||!lastPosition)
    return toast("هنوز موقعیتت دریافت نشده.");

  const d=haversine(
    lastPosition.latitude,
    lastPosition.longitude,
    target.latitude,
    target.longitude
  );

  updateTarget(lastPosition.latitude,lastPosition.longitude);

  if(d>target.radius_m+15)
    return toast("هنوز به اندازه کافی نزدیک نیستی 👀");

  $("scanBtn").disabled=true;
  setText("gameStatus","💎 گنج پیدا شد! در حال ثبت...");

  const {error}=await db.rpc("claim_treasure",{
    p_treasure_id:target.id,
    p_lat:lastPosition.latitude,
    p_lon:lastPosition.longitude
  });

  if(error){
    console.error(error);
    $("scanBtn").disabled=false;
    return toast("ثبت گنج ناموفق بود.");
  }

  toast("💎 گنج با موفقیت پیدا شد!");
  setText("gameStatus","🎉 گنج به مجموعه‌ات اضافه شد.");

  await loadProfile();
  await loadNextTreasure();
}

async function cashout(){
  if(!game||!lastPosition)
    return toast("اول یک منطقه شکار بساز.");

  const d=haversine(
    lastPosition.latitude,
    lastPosition.longitude,
    game.center_lat,
    game.center_lon
  );

  if(d>game.cashout_radius_m)
    return toast("برای تبدیل گنج باید داخل محدوده تبدیل باشی.");

  const {data,error}=await db.rpc("cashout_treasures");

  if(error){
    console.error(error);
    return toast("تبدیل ناموفق بود.");
  }

  const row=Array.isArray(data)?data[0]:data;

  if(!row||!row.coins_added)
    return toast("فعلاً گنجی برای تبدیل نداری.");

  toast(`🪙 ${row.coins_added} سکه گرفتی!`);
  await loadProfile();
}

async function leaderboard(){
  const {data,error}=await db.rpc("leaderboard");

  if(error){
    console.error(error);
    return;
  }

  $("leaderboard").innerHTML=(data||[]).map((x,i)=>`
    <div class="leaderboard-item">
      <div class="rank">${i<3?["🥇","🥈","🥉"][i]:i+1}</div>
      <div class="rank-name">${escapeHtml(x.username)}</div>
      <div class="rank-coins">🪙 ${Number(x.coins).toLocaleString()}</div>
    </div>
  `).join("")||`<div class="panel">هنوز شکارچی‌ای ثبت نشده.</div>`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",
    '"':"&quot;","'":"&#039;"
  }[c]));
}

async function toggleTheme(){
  if(!profile)return;

  const next=profile.theme==="dark"?"light":"dark";

  const {error}=await db
    .from("profiles")
    .update({theme:next})
    .eq("id",session.user.id);

  if(error)return toast("تغییر تم ناموفق بود.");

  profile.theme=next;
  updateUI();
}

async function savePassword(){
  const p=$("newPassword").value;
  const p2=$("newPassword2").value;

  if(p.length<6)
    return $("resetStatus").textContent="رمز باید حداقل ۶ کاراکتر باشد.";

  if(p!==p2)
    return $("resetStatus").textContent="رمزها یکی نیستند.";

  const {error}=await db.auth.updateUser({password:p});

  if(error)
    return $("resetStatus").textContent=error.message;

  $("resetStatus").textContent="رمز با موفقیت تغییر کرد ✅";
  setTimeout(()=>setPage("dashboard"),1000);
}

function showApp(){
  $("authPage").classList.remove("active");
  setPage("dashboard");
}

function showAuthChoice(){
  ["loginBox","signupBox","recoveryBox"].forEach(x=>$(x).classList.add("hidden"));
  $("authChoice").classList.remove("hidden");
  status("");
}

$("menuBtn").onclick=()=>$("drawer").classList.add("open");
$("closeMenu").onclick=()=>$("drawer").classList.remove("open");

document.querySelectorAll("[data-page]").forEach(btn=>{
  btn.addEventListener("click",async()=>{
    const p=btn.dataset.page;
    setPage(p);

    if(p==="leaderboard")await leaderboard();
    if(p==="game"){
      if(!target)await loadNextTreasure();
      startTracking();
    }
  });
});

$("showLogin").onclick=()=>{
  $("authChoice").classList.add("hidden");
  $("loginBox").classList.remove("hidden");
};

$("showSignup").onclick=()=>{
  $("authChoice").classList.add("hidden");
  $("signupBox").classList.remove("hidden");
};

$("forgotBtn").onclick=()=>{
  $("loginBox").classList.add("hidden");
  $("recoveryBox").classList.remove("hidden");
};

$("backAuth1").onclick=showAuthChoice;
$("backAuth2").onclick=showAuthChoice;
$("backAuth3").onclick=showAuthChoice;

$("signupBtn").onclick=signup;
$("loginBtn").onclick=login;
$("googleLogin").onclick=googleLogin;
$("recoveryBtn").onclick=recovery;
$("startAdventure").onclick=createGame;
$("scanBtn").onclick=scan;
$("cashoutBtn").onclick=cashout;
$("themeBtn").onclick=toggleTheme;
$("savePasswordBtn").onclick=savePassword;

$("logoutBtn").onclick=async()=>{
  await db.auth.signOut();
  session=null;
  profile=null;
  game=null;
  target=null;
  if(watchId!==null)navigator.geolocation.clearWatch(watchId);
  watchId=null;
  showAuthChoice();
  setPage("auth");
};

$("changePasswordBtn").onclick=()=>setPage("reset");

db.auth.onAuthStateChange(async(event,newSession)=>{
  session=newSession;

  if(session){
    await loadProfile();
    showApp();
  }else{
    $("authPage").classList.add("active");
    document.querySelectorAll(".page:not(#authPage)").forEach(x=>x.classList.remove("active"));
  }
});

(async()=>{
  const {data}=await db.auth.getSession();
  session=data.session;

  if(session){
    await loadProfile();
    showApp();
  }else{
    $("authPage").classList.add("active");
  }

  if(new URLSearchParams(location.search).get("reset")==="1"){
    setPage("reset");
  }
})();
