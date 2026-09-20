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

// Location reporting
let lastLocationSentAt=0;
let locationWriteInFlight=false;


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
  if(!session)return false;

  const user=session.user;

  try{
    let {data,error}=await db
      .from("profiles")
      .select("*")
      .eq("id",user.id)
      .maybeSingle();

    if(error){
      console.error("PROFILE SELECT ERROR:",error);
      const debugMsg="PROFILE SELECT ERROR\\n"+
        "message: "+(error.message||"")+"\\n"+
        "code: "+(error.code||"")+"\\n"+
        "details: "+(error.details||"")+"\\n"+
        "hint: "+(error.hint||"");
      console.error(debugMsg,error);
      alert(debugMsg);
      return false;
    }

    if(!data){
      const username=
        user.user_metadata?.username ||
        (user.email||"user").split("@")[0];

      const {data:created,error:createError}=await db
        .from("profiles")
        .insert({
          id:user.id,
          username:username,
          email:user.email||null,
          coins:0,
          distance_m:0,
          treasures_count:0,
          total_earned:0,
          theme:"dark",
          hunting_active:false
        })
        .select("*")
        .single();

      if(createError){
        console.error("PROFILE CREATE ERROR:",createError);
        const debugMsg="PROFILE CREATE ERROR\\n"+
          "message: "+(createError.message||"")+"\\n"+
          "code: "+(createError.code||"")+"\\n"+
          "details: "+(createError.details||"")+"\\n"+
          "hint: "+(createError.hint||"");
        console.error(debugMsg,createError);
        alert(debugMsg);
        return false;
      }

      data=created;
    }

    profile=data;
    updateUI();
    return true;

  }catch(err){
    console.error("PROFILE LOAD EXCEPTION:",err);
    toast("خطای غیرمنتظره در پروفایل");
    return false;
  }
}



async function saveLocationToSupabase(lat,lon,accuracy,timestamp){
  if(!session || locationWriteInFlight)return;

  const now=Date.now();

  // حداکثر هر ۵ ثانیه یک location ارسال شود
  if(now-lastLocationSentAt<5000)return;

  locationWriteInFlight=true;
  lastLocationSentAt=now;

  try{
    const userId=session.user.id;

    // username را از profile فعلی می‌گیریم
    const username=
      profile?.username ||
      session.user.user_metadata?.username ||
      "Unknown";

    /*
     * اول location جدید را ثبت می‌کنیم.
     * این باعث می‌شود Backend هیچ‌وقت بدون location نماند.
     */
    const {data:newLocation,error:insertError}=await db
      .from("locations")
      .insert({
        user_id:userId,
        username:username,
        latitude:Number(lat),
        longitude:Number(lon),
        accuracy:Number(accuracy||0),
        location_timestamp:Number(timestamp||Date.now())
      })
      .select("id")
      .single();

    if(insertError){
      console.error("[LOCATION] INSERT ERROR:",insertError);
      return;
    }

    console.log(
      "[LOCATION] SENT:",
      username,
      Number(lat).toFixed(7),
      Number(lon).toFixed(7),
      "accuracy:",
      Number(accuracy||0).toFixed(1)
    );

  }catch(err){
    console.error("[LOCATION] ERROR:",err);
  }finally{
    locationWriteInFlight=false;
  }
}


async function getCurrentPositionAsync(){
  if(!navigator.geolocation){
    throw new Error("Geolocation is not supported");
  }

  return new Promise((resolve,reject)=>{
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy:true,
        timeout:15000,
        maximumAge:0
      }
    );
  });
}


async function savePlayerSaleZone(lat,lon){
  if(!session)return false;

  const userId=session.user.id;

  try{
    /*
     * اگر منطقه قبلی وجود داشته باشد، همان رکورد را به
     * محل شروع شکار جدید منتقل می‌کنیم.
     */
    const {data:updated,error:updateError}=await db
      .from("player_zones")
      .update({
        center_latitude:lat,
        center_longitude:lon,
        updated_at:new Date().toISOString()
      })
      .eq("user_id",userId)
      .select()
      .maybeSingle();

    if(updateError){
      console.error("SALE ZONE UPDATE ERROR:",updateError);
      return false;
    }

    if(updated){
      console.log("[SALE ZONE] updated:",lat,lon);
      return true;
    }

    const {error:insertError}=await db
      .from("player_zones")
      .insert({
        user_id:userId,
        center_latitude:lat,
        center_longitude:lon,
        radius_m:1000,
        exchange_radius_m:150
      });

    if(insertError){
      console.error("SALE ZONE INSERT ERROR:",insertError);
      return false;
    }

    console.log("[SALE ZONE] created:",lat,lon);
    return true;

  }catch(err){
    console.error("SALE ZONE ERROR:",err);
    return false;
  }
}


function buildMapLinks(lat,lon){
  const coords=`${Number(lat).toFixed(7)},${Number(lon).toFixed(7)}`;

  /*
   * Google Maps universal URL:
   * Android -> Maps app if installed
   * otherwise -> browser
   */
  const google=
    "https://www.google.com/maps/search/?api=1&query="+
    encodeURIComponent(coords);

  /*
   * Neshan Android intent.
   * If Neshan is installed -> opens the app.
   * Otherwise -> fallback to Neshan web.
   */
  const neshanWeb=
    "https://nshn.ir/?lat="+
    encodeURIComponent(lat)+
    "&lng="+
    encodeURIComponent(lon);

  const neshanIntent=
    "intent://nshn.ir/?lat="+
    encodeURIComponent(lat)+
    "&lng="+
    encodeURIComponent(lon)+
    "#Intent;scheme=http;package=org.rajman.neshan.traffic.tehran.navigator;"+
    "S.browser_fallback_url="+
    encodeURIComponent(neshanWeb)+
    ";end";

  return {google,neshanWeb,neshanIntent};
}


function showCashoutMapLinks(lat,lon){
  const box=$("cashoutMapLinks");

  if(!box)return;

  const links=buildMapLinks(lat,lon);

  box.innerHTML=`
    <div class="cashout-map-title">
      📍 محل تبدیل گنج
    </div>

    <div class="cashout-map-links">
      <a
        class="map-link google-map-link"
        href="${links.google}"
        target="_blank"
        rel="noopener">
        🗺️ دیدن محل فروش در Google Maps
      </a>

      <a
        class="map-link neshan-map-link"
        href="${links.neshanIntent}">
        📍 دیدن محل فروش در نشان
      </a>
    </div>
  `;

  box.classList.remove("hidden");
}


async function loadSaleZone(){
  if(!session)return null;

  const {data,error}=await db
    .from("player_zones")
    .select("center_latitude,center_longitude,radius_m,exchange_radius_m")
    .eq("user_id",session.user.id)
    .maybeSingle();

  if(error){
    console.error("SALE ZONE LOAD ERROR:",error);
    return null;
  }

  return data;
}


async function setHuntingActive(active){
  if(!session)return false;

  const {data,error}=await db
    .from("profiles")
    .update({hunting_active:!!active})
    .eq("id",session.user.id)
    .select("hunting_active")
    .maybeSingle();

  if(error){
    console.error("HUNTING STATE ERROR:",error);
    toast("خطا در تغییر وضعیت شکار");
    return false;
  }

  if(profile)profile.hunting_active=!!active;
  updateUI();
  return true;
}

async function resetCurrentHunt(){
  if(!session)return;

  const ok=confirm(
    "مطمئنی مکان فعلی پاک شه؟\n\n"+
    "تمام گنج‌های منطقه فعلی و موقعیت فعلی پاک می‌شوند "+
    "و شکار با مکان فعلی دوباره شروع می‌شود."
  );

  if(!ok)return;

  const {error}=await db.rpc("reset_hunt");

  if(error){
    console.error("RESET HUNT ERROR:",error);
    toast(
      "خطا در پاک کردن منطقه: "+
      (error.message||"Unknown error")
    );
    return;
  }

  target=null;
  game=null;
  lastPosition=null;

  if(watchId!==null){
    navigator.geolocation.clearWatch(watchId);
    watchId=null;
  }

  await loadProfile();
  setPage("dashboard");
  toast("منطقه قبلی پاک شد. حالا شکار جدید را شروع کن 🧭");
}


function updateHuntButtons(){
  const start=$("startAdventure");
  const cont=$("continueAdventure");

  if(!profile)return;

  const active=profile.hunting_active===true;

  if(start)start.classList.toggle("hidden",active);
  if(cont)cont.classList.toggle("hidden",!active);

  const reset=$("resetHuntBtn");
  if(reset)reset.classList.toggle("hidden",!active);
}

function updateUI(){
  if(!profile)return;

  updateHuntButtons();

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

  let {data,error}=await db.auth.signInWithPassword({
    email:authEmail(u),
    password:p
  });

  // اگر کاربر با ایمیل واقعی ثبت‌نام کرده باشد،
  // authEmail جواب نمی‌دهد؛ از RPC برای پیدا کردن ایمیل Auth استفاده می‌کنیم.
  if(error){
    const lookup=await db.rpc("get_auth_email_by_username",{p_username:u});

    if(!lookup.error && lookup.data){
      const realEmail=Array.isArray(lookup.data)
        ? lookup.data[0]
        : lookup.data;

      if(realEmail){
        const retry=await db.auth.signInWithPassword({
          email:realEmail,
          password:p
        });

        data=retry.data;
        error=retry.error;
      }
    }
  }

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

  try{
    toast("در حال پیدا کردن منطقه شکار...");

    const pos=await getCurrentPositionAsync();
    const lat=pos.coords.latitude;
    const lon=pos.coords.longitude;

    /*
     * محل فروش از همان لحظه شروع شکار تعیین می‌شود.
     */
    await savePlayerSaleZone(lat,lon);

    /*
     * شروع شکار از RPC انجام می‌شود تا منطق سمت DB
     * و وضعیت hunting_active همزمان ثبت شوند.
     */
    const {data,error}=await db.rpc("start_hunt",{
      p_lat:lat,
      p_lon:lon
    });

    if(error){
      console.error("START HUNT ERROR:",error);
      toast("ساخت منطقه شکار ناموفق بود: "+(error.message||""));
      return;
    }

    game=Array.isArray(data) ? data[0] : data;

    if(!game){
      /*
       * اگر RPC خروجی نداشت، state فعلی را بخوان.
       */
      const {data:state,error:stateError}=await db
        .from("game_state")
        .select("*")
        .eq("user_id",session.user.id)
        .maybeSingle();

      if(stateError){
        console.error(stateError);
        toast("منطقه شکار ساخته نشد.");
        return;
      }

      game=state;
    }

    await setHuntingActive(true);

    startTracking();
    await loadNextTreasure();

    setPage("game");

    toast("شکار شروع شد 🔥");

  }catch(err){
    console.error("CREATE GAME ERROR:",err);
    toast(
      "شروع شکار ناموفق بود: "+
      (err.message||"خطای ناشناخته")
    );
  }
}

function restoreLastPosition(){
  if(lastPosition)return;

  try{
    const raw=sessionStorage.getItem(
      "treasureHunterLastPosition"
    );

    if(!raw)return;

    const saved=JSON.parse(raw);

    if(
      Number.isFinite(Number(saved.latitude)) &&
      Number.isFinite(Number(saved.longitude))
    ){
      lastPosition={
        latitude:Number(saved.latitude),
        longitude:Number(saved.longitude),
        accuracy:Number(saved.accuracy||50),
        timestamp:Number(saved.timestamp||Date.now()),
        _receivedAt:Number(saved._receivedAt||Date.now())
      };

      console.log("[GPS] restored:",lastPosition);
    }
  }catch(err){
    console.warn("[GPS] restore failed:",err);
  }
}


function startTracking(){
  if(watchId!==null)return;

  restoreLastPosition();

  watchId=navigator.geolocation.watchPosition(
    async pos=>{
      const p=pos.coords;

      const lat=Number(p.latitude);
      const lon=Number(p.longitude);
      const accuracy=Number(p.accuracy||999);
      const now=Date.now();

      if(
        !Number.isFinite(lat) ||
        !Number.isFinite(lon)
      ){
        return;
      }

      /*
       * Location reporting:
       * هر ۵ ثانیه آخرین موقعیت معتبر کاربر
       * برای Backend داخل جدول locations ثبت می‌شود.
       */
      saveLocationToSupabase(
        lat,
        lon,
        accuracy,
        Number(p.timestamp||now)
      );

      /*
       * GPS خیلی بد را قبول نکن.
       */
      if(accuracy>100){
        console.warn(
          "[GPS] poor accuracy ignored:",
          accuracy
        );
        return;
      }

      /*
       * جلوگیری از پرش‌های غیرواقعی GPS.
       */
      if(lastPosition){

        const oldTime=Number(
          lastPosition._receivedAt ||
          lastPosition.timestamp ||
          now
        );

        const elapsed=Math.max(
          0.5,
          (now-oldTime)/1000
        );

        const jump=haversine(
          Number(lastPosition.latitude),
          Number(lastPosition.longitude),
          lat,
          lon
        );

        /*
         * سقف منطقی جابه‌جایی.
         * GPS می‌تواند خطا داشته باشد، پس خیلی سخت‌گیر نیستیم.
         */
        const maxAllowed=Math.max(
          80,
          Math.min(
            300,
            elapsed*45 + accuracy*2
          )
        );

        if(jump>maxAllowed){
          console.warn(
            "[GPS] impossible jump ignored:",
            Math.round(jump),
            "m / max",
            Math.round(maxAllowed),
            "m"
          );
          return;
        }

        /*
         * فقط حرکت واقعی را به مسافت اضافه کن.
         */
        if(jump>2 && jump<300){
          try{
            await db.rpc("add_distance",{
              p_meters:jump
            });
          }catch(err){
            console.warn(
              "[GPS] distance update failed:",
              err
            );
          }
        }
      }

      lastPosition={
        latitude:lat,
        longitude:lon,
        accuracy:accuracy,
        timestamp:Number(p.timestamp||now),
        _receivedAt:now
      };

      /*
       * آخرین موقعیت معتبر را نگه می‌داریم تا وقتی کاربر
       * از صفحه خارج و دوباره وارد شد، موقعیت یک‌دفعه
       * از صفر شروع نشود.
       */
      try{
        sessionStorage.setItem(
          "treasureHunterLastPosition",
          JSON.stringify(lastPosition)
        );
      }catch(_){}

      if(target){
        updateTarget(lat,lon);
      }
    },

    err=>{
      console.warn("[GPS]",err);
    },

    {
      enableHighAccuracy:true,
      maximumAge:3000,
      timeout:20000
    }
  );
}



async function resumeHunt(){
  if(!session)return;

  restoreLastPosition();

  if(!profile){
    await loadProfile();
  }

  /*
   * اگر شکار فعال نیست، شروع شکار جدید.
   */
  if(!profile?.hunting_active){
    return createGame();
  }

  /*
   * اینجا نباید createGame اجرا شود.
   * چون createGame یعنی ساخت منطقه جدید.
   */
  if(!target){
    await loadNextTreasure();
  }

  startTracking();

  setPage("game");

  /*
   * اگر موقعیت قبلی داریم، همان لحظه UI را آپدیت کن.
   * لازم نیست منتظر GPS بعدی بمانیم.
   */
  if(lastPosition && target){
    updateTarget(
      lastPosition.latitude,
      lastPosition.longitude
    );
  }
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
    setText("treasureTitle","همه گنج‌های این منطقه پیدا شدن! 🏆");
    setText("targetDistance","منطقه پاکسازی شد");
    setText("targetHint","در حال آماده‌سازی منطقه بعدی...");

    // راند بعدی را فقط وقتی واقعاً تمام شده بساز
    if(game){
      const nextCenter = lastPosition || {
        latitude: game.center_lat,
        longitude: game.center_lon
      };

      const seed=Math.floor(Math.random()*2147483647);

      const {data:newGame,error:gameError}=await db
        .from("game_state")
        .insert({
          user_id:session.user.id,
          center_lat:nextCenter.latitude,
          center_lon:nextCenter.longitude,
          cashout_radius_m:250,
          seed
        })
        .select()
        .single();

      if(gameError){
        console.error(gameError);
        $("scanBtn").disabled=true;
        return toast("ساخت منطقه بعدی ناموفق بود.");
      }

      game=newGame;

      const treasures=[];

      for(let i=1;i<=8;i++){
        const x=randomAround(
          nextCenter.latitude,
          nextCenter.longitude,
          80+i*25,
          450+i*35
        );

        treasures.push({
          user_id:session.user.id,
          sequence:i,
          latitude:x.lat,
          longitude:x.lon,
          radius_m:38,
          reward:50+(i*25)
        });
      }

      const {error:treasureError}=await db
        .from("treasures")
        .insert(treasures);

      if(treasureError){
        console.error(treasureError);
        return toast("ساخت گنج‌های منطقه بعدی ناموفق بود.");
      }

      toast("🗺️ منطقه جدید پیدا شد!");

      // دوباره اولین گنج منطقه جدید را بگیر
      return loadNextTreasure();
    }
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

async function getSellableTreasureCount(){
  if(!session){
    return {
      count:0,
      error:null
    };
  }

  const {count,error}=await db
    .from("treasures")
    .select("id",{
      count:"exact",
      head:true
    })
    .eq("user_id",session.user.id)
    .eq("found",true);

  return {
    count:Number(count||0),
    error
  };
}


function renderCashoutPanel(zone,count,distance){
  const box=$("cashoutMapLinks");

  if(!box)return;

  const saleLat=Number(zone.center_latitude);
  const saleLon=Number(zone.center_longitude);

  const links=buildMapLinks(
    saleLat,
    saleLon
  );

  const radius=Number(
    zone.exchange_radius_m||150
  );

  const inside=
    Number.isFinite(distance) &&
    distance<=radius;

  let statusHtml="";

  if(count===0){

    statusHtml=`
      <div class="cashout-count empty">
        <div class="cashout-count-icon">📦</div>
        <div>
          <strong>گنجی برای فروش ندارید</strong>
          <span>اول چند گنج پیدا کن، بعد برای فروش برگرد.</span>
        </div>
      </div>
    `;

  }else{

    statusHtml=`
      <div class="cashout-count">
        <div class="cashout-count-icon">💎</div>
        <div>
          <strong>${count.toLocaleString("fa-IR")} گنج برای فروش دارید</strong>
          <span>
            ${
              inside
                ? "در محدوده فروش هستی و می‌تونی همین الان تبدیلشون کنی."
                : "برای فروش باید به محل تبدیل برسی."
            }
          </span>
        </div>
      </div>
    `;
  }

  let locationStatus="";

  if(Number.isFinite(distance)){

    if(inside){

      locationStatus=`
        <div class="cashout-location-ok">
          🟢 داخل محدوده فروش
          <span>فاصله: ${Math.round(distance)} متر</span>
        </div>
      `;

    }else{

      locationStatus=`
        <div class="cashout-location-away">
          🔴 خارج از محدوده فروش
          <span>
            فاصله فعلی: ${Math.round(distance)} متر
            • محدوده تبدیل: ${Math.round(radius)} متر
          </span>
        </div>
      `;
    }
  }

  const convertButton =
    count>0
      ? `
        <button
          id="confirmCashoutBtn"
          class="cashout-convert-btn"
          ${inside?"":"disabled"}>
          🪙 تبدیل ${count.toLocaleString("fa-IR")} گنج به سکه
        </button>
      `
      : `
        <button
          class="cashout-convert-btn disabled-looking"
          disabled>
          🪙 گنجی برای تبدیل وجود ندارد
        </button>
      `;

  box.innerHTML=`
    <div class="cashout-header">
      <div>
        <div class="cashout-map-title">
          🏪 محل فروش و تبدیل گنج
        </div>
        <div class="cashout-subtitle">
          این محل از منطقه شروع شکار شما تعیین شده است.
        </div>
      </div>

      <button
        id="closeCashoutPanel"
        class="cashout-close"
        type="button"
        aria-label="بستن">
        ×
      </button>
    </div>

    ${statusHtml}

    ${locationStatus}

    <div class="cashout-divider"></div>

    <div class="cashout-map-label">
      انتخاب نقشه:
    </div>

    <div class="cashout-map-links">
      <a
        class="map-link google-map-link"
        href="${links.google}"
        target="_blank"
        rel="noopener">
        🗺️ دیدن محل فروش در Google Maps
      </a>

      <a
        class="map-link neshan-map-link"
        href="${links.neshanIntent}">
        📍 دیدن محل فروش در نشان
      </a>
    </div>

    <div class="cashout-coordinates">
      📍 ${saleLat.toFixed(6)} ، ${saleLon.toFixed(6)}
    </div>

    <div class="cashout-actions">
      ${convertButton}
    </div>
  `;

  box.classList.remove("hidden");

  const close=$("closeCashoutPanel");

  if(close){
    close.onclick=()=>{
      box.classList.add("hidden");
    };
  }

  const convert=$("confirmCashoutBtn");

  if(convert){
    convert.onclick=performCashout;
  }
}


async function cashout(){
  if(!session)return;

  const box=$("cashoutMapLinks");

  if(box){
    box.classList.remove("hidden");
    box.innerHTML=`
      <div class="cashout-loading">
        <div class="cashout-spinner"></div>
        <span>در حال بررسی گنج‌های قابل فروش...</span>
      </div>
    `;
  }

  let zone=await loadSaleZone();

  /*
   * اگر کاربر قدیمی باشد و player_zones هنوز نداشته باشد،
   * از آخرین موقعیت معتبر برای ساخت منطقه استفاده کن.
   */
  if(!zone && lastPosition){

    await savePlayerSaleZone(
      lastPosition.latitude,
      lastPosition.longitude
    );

    zone=await loadSaleZone();
  }

  if(!zone){

    if(box){
      box.innerHTML=`
        <div class="cashout-error">
          ❌ هنوز محل فروش برای این حساب ثبت نشده.
          <span>یک بار شکار را شروع کن تا محل فروش تعیین شود.</span>
        </div>
      `;
    }

    return;
  }

  const result=
    await getSellableTreasureCount();

  if(result.error){

    console.error(
      "SELLABLE TREASURE COUNT ERROR:",
      result.error
    );

    if(box){
      box.innerHTML=`
        <div class="cashout-error">
          ❌ دریافت اطلاعات فروش ناموفق بود.
          <span>${escapeHtml(
            result.error.message||"خطای ناشناخته"
          )}</span>
        </div>
      `;
    }

    return;
  }

  let distance=NaN;

  if(lastPosition){

    distance=haversine(
      lastPosition.latitude,
      lastPosition.longitude,
      Number(zone.center_latitude),
      Number(zone.center_longitude)
    );
  }

  renderCashoutPanel(
    zone,
    result.count,
    distance
  );
}


async function performCashout(){
  if(!session)return;

  const button=$("confirmCashoutBtn");

  if(button){
    button.disabled=true;
    button.textContent="⏳ در حال تبدیل...";
  }

  /*
   * قبل از فروش دوباره محل و موقعیت را بررسی کن.
   */
  const zone=await loadSaleZone();

  if(!zone){

    toast("محل فروش پیدا نشد.");

    if(button){
      button.disabled=false;
    }

    return;
  }

  if(!lastPosition){

    toast("هنوز موقعیت مکانی دریافت نشده.");

    if(button){
      button.disabled=false;
    }

    return;
  }

  const saleLat=Number(
    zone.center_latitude
  );

  const saleLon=Number(
    zone.center_longitude
  );

  const distance=haversine(
    lastPosition.latitude,
    lastPosition.longitude,
    saleLat,
    saleLon
  );

  const radius=Number(
    zone.exchange_radius_m||150
  );

  if(distance>radius){

    toast(
      `برای فروش باید داخل محدوده باشی. فاصله فعلی ${Math.round(distance)} متر است.`
    );

    if(button){
      button.disabled=false;
      button.textContent="🪙 تبدیل گنج‌ها به سکه";
    }

    return;
  }

  const {data,error}=await db.rpc(
    "cashout_treasures"
  );

  if(error){

    console.error(
      "CASHOUT ERROR:",
      error
    );

    toast(
      "تبدیل ناموفق بود: "+
      (error.message||"خطای ناشناخته")
    );

    if(button){
      button.disabled=false;
      button.textContent="🪙 تلاش دوباره";
    }

    return;
  }

  const row=
    Array.isArray(data)
      ? data[0]
      : data;

  const coins=
    Number(row?.coins_added||0);

  const converted=
    Number(row?.treasures_converted||0);

  await loadProfile();

  /*
   * پنل فروش را نگه می‌داریم.
   * لینک‌های نقشه همچنان قابل استفاده‌اند.
   */
  renderCashoutPanel(
    zone,
    0,
    distance
  );

  const box=$("cashoutMapLinks");

  if(box){

    const success=document.createElement("div");

    success.className=
      "cashout-success";

    success.innerHTML=`
      <strong>🎉 فروش با موفقیت انجام شد!</strong>
      <span>
        ${converted.toLocaleString("fa-IR")}
        گنج تبدیل شد و
        ${coins.toLocaleString("fa-IR")}
        سکه به حسابت اضافه شد.
      </span>
    `;

    box.prepend(success);
  }

  toast(
    `🪙 ${coins.toLocaleString("fa-IR")} سکه دریافت کردی!`
  );
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
  if(watchId!==null){
    navigator.geolocation.clearWatch(watchId);
  }

  watchId=null;
  lastPosition=null;

  try{
    sessionStorage.removeItem(
      "treasureHunterLastPosition"
    );
  }catch(_){}

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


document.addEventListener("DOMContentLoaded",()=>{
  const start=$("startAdventure");
  const cont=$("continueAdventure");
  const reset=$("resetHuntBtn");

  if(start){
    start.addEventListener("click",createGame);
  }

  if(cont){
    cont.addEventListener("click",resumeHunt);
  }

  if(reset){
    reset.addEventListener("click",resetCurrentHunt);
  }
});
