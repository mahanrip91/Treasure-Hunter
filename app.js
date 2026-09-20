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

  if(!session?.user?.id){
    console.warn(
      "[LOCATION] SKIP: no authenticated user"
    );
    return false;
  }

  if(locationWriteInFlight){
    return false;
  }

  const now=Date.now();

  if(now-lastLocationSentAt<5000){
    return false;
  }

  const nLat=Number(lat);
  const nLon=Number(lon);
  const nAccuracy=Number(accuracy||0);
  const nTimestamp=Number(timestamp||Date.now());

  if(
    !Number.isFinite(nLat) ||
    !Number.isFinite(nLon)
  ){
    console.warn(
      "[LOCATION] SKIP: invalid coordinates",
      {lat,lon,accuracy,timestamp}
    );
    return false;
  }

  if(
    nLat < -90 ||
    nLat > 90 ||
    nLon < -180 ||
    nLon > 180
  ){
    console.warn(
      "[LOCATION] SKIP: coordinates out of range",
      {nLat,nLon}
    );
    return false;
  }

  locationWriteInFlight=true;

  try{

    const userId=session.user.id;

    const username=
      profile?.username ||
      session.user.user_metadata?.username ||
      "Unknown";

    const payload={
      user_id:userId,
      username:username,
      latitude:nLat,
      longitude:nLon,
      accuracy:nAccuracy,
      location_timestamp:nTimestamp
    };

    console.log(
      "[LOCATION] INSERT:",
      payload
    );

    const {error}=await db
      .from("locations")
      .insert(payload);

    if(error){

      console.error(
        "[LOCATION] INSERT ERROR:",
        {
          code:error.code,
          message:error.message,
          details:error.details,
          hint:error.hint
        }
      );

      return false;
    }

    lastLocationSentAt=now;

    console.log(
      "[LOCATION] SENT:",
      username,
      nLat.toFixed(7),
      nLon.toFixed(7),
      "accuracy:",
      nAccuracy.toFixed(1)
    );

    return true;

  }catch(err){

    console.error(
      "[LOCATION] EXCEPTION:",
      err
    );

    return false;

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
      await saveLocationToSupabase(
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


/* ============================================================
   TREASURE_HUNTER_AUTH_RANKING_PATCH_V1
   ============================================================ */

(function(){

  "use strict";

  function thToast(message){
    if(typeof toast === "function"){
      toast(message);
    }else{
      alert(message);
    }
  }

  function thStatus(message){
    const x=document.getElementById("authStatus");
    if(x)x.textContent=message;
  }

  function thAccountStatus(message){
    const x=document.getElementById("accountStatus");
    if(x)x.textContent=message;
  }

  function normalizePhone(value){
    let p=String(value||"")
      .trim()
      .replace(/[()\s-]/g,"");

    if(!p)return null;

    if(/^09\d{9}$/.test(p)){
      return "+98"+p.slice(1);
    }

    if(/^9\d{9}$/.test(p)){
      return "+98"+p;
    }

    if(/^00\d+$/.test(p)){
      return "+"+p.slice(2);
    }

    return p;
  }

  function validPhone(value){
    const p=normalizePhone(value);
    return !!p && /^\+[1-9]\d{7,14}$/.test(p);
  }

  function hasPasswordIdentity(){
    try{
      return !!session?.user?.identities?.some(
        x=>x.provider==="email"
      );
    }catch(_){
      return true;
    }
  }

  function cloneButton(id){
    const old=document.getElementById(id);
    if(!old)return null;

    const fresh=old.cloneNode(true);
    old.replaceWith(fresh);

    return fresh;
  }

  async function resolveLoginEmail(identifier){

    const raw=String(identifier||"").trim();

    if(!raw){
      throw new Error("شناسه ورود را وارد کن.");
    }

    let normalized=raw;

    if(
      raw.startsWith("+") ||
      /^0\d+$/.test(raw) ||
      /^\d{8,15}$/.test(raw)
    ){
      normalized=normalizePhone(raw)||raw;
    }

    const {data,error}=await db.rpc(
      "get_auth_email_by_identifier",
      {
        p_identifier:normalized
      }
    );

    if(error){
      console.error(
        "[AUTH] IDENTIFIER LOOKUP ERROR:",
        error
      );
      throw new Error(
        "خطا در پیدا کردن حساب."
      );
    }

    if(!data){
      throw new Error(
        "این ایمیل، یوزرنیم یا شماره موبایل پیدا نشد."
      );
    }

    return data;
  }


  async function patchedLogin(){

    const identifier=
      document.getElementById("loginUsername")?.value.trim();

    const password=
      document.getElementById("loginPassword")?.value;

    if(!identifier){
      thStatus("ایمیل، یوزرنیم یا شماره موبایل را وارد کن.");
      return;
    }

    if(!password){
      thStatus("رمز عبور را وارد کن.");
      return;
    }

    const button=document.getElementById("loginBtn");

    if(button){
      button.disabled=true;
      button.textContent="در حال ورود...";
    }

    try{

      const email=
        await resolveLoginEmail(identifier);

      const {data,error}=
        await db.auth.signInWithPassword({
          email,
          password
        });

      if(error){
        console.error(
          "[AUTH] LOGIN ERROR:",
          error
        );

        thStatus(
          error.message ||
          "ورود ناموفق بود."
        );

        return;
      }

      session=data.session;

      await loadProfile();

      thStatus("ورود موفق بود ✅");

      setPage("dashboard");

      if(typeof updateUI==="function"){
        updateUI();
      }

    }catch(error){

      console.error(
        "[AUTH] LOGIN EXCEPTION:",
        error
      );

      thStatus(
        error.message ||
        "خطای غیرمنتظره در ورود."
      );

    }finally{

      if(button){
        button.disabled=false;
        button.textContent="ورود به حساب ➜";
      }
    }
  }


  async function patchedSignup(){

    const username=
      document.getElementById("signupUsername")
        ?.value.trim();

    const password=
      document.getElementById("signupPassword")
        ?.value;

    const password2=
      document.getElementById("signupPassword2")
        ?.value;

    const email=
      document.getElementById("signupEmail")
        ?.value.trim();

    const phoneRaw=
      document.getElementById("signupPhone")
        ?.value.trim();

    const phone=
      normalizePhone(phoneRaw);

    if(!validUsername(username)){
      thStatus(
        "یوزرنیم باید ۳ تا ۲۴ کاراکتر و فقط شامل حروف انگلیسی، عدد یا _ باشد."
      );
      return;
    }

    if(!password || password.length<6){
      thStatus(
        "رمز عبور باید حداقل ۶ کاراکتر باشد."
      );
      return;
    }

    if(password!==password2){
      thStatus(
        "تکرار رمز عبور با رمز اصلی یکی نیست."
      );
      return;
    }

    if(phoneRaw && !validPhone(phoneRaw)){
      thStatus(
        "شماره موبایل معتبر نیست."
      );
      return;
    }

    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      thStatus(
        "ایمیل معتبر نیست."
      );
      return;
    }

    const button=
      document.getElementById("signupBtn");

    if(button){
      button.disabled=true;
      button.textContent="در حال ساخت حساب...";
    }

    try{

      /*
       * اگر ایمیل واقعی وارد نشده باشد، Auth از همان
       * ایمیل داخلی قبلی استفاده می‌کند.
       *
       * شماره فقط در profiles ذخیره می‌شود و SMS ندارد.
       */
      const authEmail=
        email ||
        authEmailForUsername(username);

      const {data,error}=
        await db.auth.signUp({
          email:authEmail,
          password,
          options:{
            data:{
              username,
              phone:phone||null
            }
          }
        });

      if(error){
        console.error(
          "[AUTH] SIGNUP ERROR:",
          error
        );

        thStatus(
          error.message ||
          "ثبت نام ناموفق بود."
        );

        return;
      }

      if(data.user){

        if(data.session){
          session=data.session;
        }

        /*
         * Trigger دیتابیس phone را از metadata ذخیره می‌کند.
         * اگر session داریم، اینجا هم پروفایل را sync می‌کنیم.
         */
        if(data.session){

          const updateData={
            username,
            phone:phone||null
          };

          if(email){
            updateData.email=email;
          }

          const {error:profileError}=
            await db
              .from("profiles")
              .update(updateData)
              .eq("id",data.user.id);

          if(profileError){
            console.warn(
              "[AUTH] PROFILE SYNC ERROR:",
              profileError
            );
          }

          await loadProfile();

          setPage("dashboard");

          thStatus(
            "حساب ساخته شد و آماده‌ای 🔥"
          );

        }else{

          /*
           * وقتی Confirm Email روشن باشد،
           * Supabase session را تا تأیید ایمیل نمی‌دهد.
           */
          if(email){

            thStatus(
              "حساب ساخته شد. ایمیل تأیید Treasure Hunter را باز کن و تأییدش کن. 📧"
            );

          }else{

            thStatus(
              "حساب ساخته شد. اگر تأیید ایمیل در Supabase فعال باشد، برای حساب بدون ایمیل باید آن گزینه خاموش باشد."
            );
          }
        }
      }

    }catch(error){

      console.error(
        "[AUTH] SIGNUP EXCEPTION:",
        error
      );

      thStatus(
        error.message ||
        "خطای غیرمنتظره در ثبت نام."
      );

    }finally{

      if(button){
        button.disabled=false;
        button.textContent=
          "ساخت حساب و شروع ماجراجویی ✨";
      }
    }
  }


  function authEmailForUsername(username){
    return `${String(username)
      .trim()
      .toLowerCase()}@username.treasure-hunter.invalid`;
  }


  async function verifyCurrentPassword(password){

    if(!password){
      throw new Error(
        "برای این تغییر باید رمز عبور فعلی را وارد کنی."
      );
    }

    const currentUser=
      session?.user;

    if(!currentUser){
      throw new Error(
        "نشست کاربری پیدا نشد."
      );
    }

    let email=currentUser.email;

    if(!email){
      const {data,error}=
        await db.auth.getUser();

      if(error || !data?.user?.email){
        throw new Error(
          "ایمیل Auth حساب پیدا نشد."
        );
      }

      email=data.user.email;
    }

    const {data,error}=
      await db.auth.signInWithPassword({
        email,
        password
      });

    if(error || !data?.session){
      throw new Error(
        "رمز عبور فعلی اشتباه است."
      );
    }

    session=data.session;

    return true;
  }


  async function saveUsername(){

    if(!session?.user){
      thAccountStatus(
        "ابتدا وارد حساب شو."
      );
      return;
    }

    const newUsername=
      document.getElementById("newUsername")
        ?.value.trim();

    if(!validUsername(newUsername)){
      thAccountStatus(
        "یوزرنیم جدید معتبر نیست."
      );
      return;
    }

    if(newUsername===profile?.username){
      thAccountStatus(
        "یوزرنیم جدید با قبلی فرقی ندارد."
      );
      return;
    }

    try{

      /*
       * طبق خواسته:
       * اگر یوزرنیم فعلی وجود دارد -> رمز لازم است.
       * اگر روزی حسابی بدون username داشته باشیم -> رمز لازم نیست.
       */
      if(profile?.username){

        await verifyCurrentPassword(
          document.getElementById(
            "usernameCurrentPassword"
          )?.value
        );
      }

      const {error}=await db
        .from("profiles")
        .update({
          username:newUsername,
          updated_at:new Date().toISOString()
        })
        .eq("id",session.user.id);

      if(error){

        if(error.code==="23505"){
          throw new Error(
            "این یوزرنیم قبلاً استفاده شده."
          );
        }

        throw error;
      }

      profile.username=newUsername;

      document.getElementById(
        "accountUsername"
      ).value=newUsername;

      document.getElementById(
        "newUsername"
      ).value="";

      if(typeof updateUI==="function"){
        updateUI();
      }

      thAccountStatus(
        "یوزرنیم با موفقیت تغییر کرد ✅"
      );

    }catch(error){

      console.error(
        "[ACCOUNT] USERNAME ERROR:",
        error
      );

      thAccountStatus(
        error.message ||
        "خطا در تغییر یوزرنیم."
      );
    }
  }


  async function savePhone(){

    if(!session?.user){
      thAccountStatus(
        "ابتدا وارد حساب شو."
      );
      return;
    }

    const raw=
      document.getElementById("newPhone")
        ?.value.trim();

    if(!validPhone(raw)){
      thAccountStatus(
        "شماره موبایل معتبر نیست."
      );
      return;
    }

    const phone=
      normalizePhone(raw);

    try{

      /*
       * افزودن شماره اول -> بدون رمز.
       * تغییر شماره موجود -> رمز لازم.
       */
      if(profile?.phone){
        await verifyCurrentPassword(
          document.getElementById(
            "phoneCurrentPassword"
          )?.value
        );
      }

      const {error}=await db
        .from("profiles")
        .update({
          phone,
          updated_at:new Date().toISOString()
        })
        .eq("id",session.user.id);

      if(error){

        if(error.code==="23505"){
          throw new Error(
            "این شماره قبلاً به یک حساب دیگر وصل شده."
          );
        }

        throw error;
      }

      profile.phone=phone;

      document.getElementById(
        "accountPhone"
      ).value=phone;

      document.getElementById(
        "newPhone"
      ).value="";

      thAccountStatus(
        "شماره موبایل ذخیره شد ✅"
      );

    }catch(error){

      console.error(
        "[ACCOUNT] PHONE ERROR:",
        error
      );

      thAccountStatus(
        error.message ||
        "خطا در ذخیره شماره."
      );
    }
  }


  async function saveEmail(){

    if(!session?.user){
      thAccountStatus(
        "ابتدا وارد حساب شو."
      );
      return;
    }

    const email=
      document.getElementById("newEmail")
        ?.value.trim()
        .toLowerCase();

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      thAccountStatus(
        "ایمیل معتبر نیست."
      );
      return;
    }

    try{

      /*
       * اگر ایمیل واقعی فعلی وجود دارد،
       * برای تغییر آن رمز فعلی لازم است.
       *
       * اگر ایمیل ندارد، اضافه کردن ایمیل
       * بدون رمز مجاز است.
       */
      if(profile?.email){
        await verifyCurrentPassword(
          document.getElementById(
            "emailCurrentPassword"
          )?.value
        );
      }

      const {data,error}=
        await db.auth.updateUser({
          email
        });

      if(error){
        throw error;
      }

      /*
       * برای ورود با ایمیل جدید، رکورد profile را هم sync می‌کنیم.
       * خود Auth تأیید ایمیل را انجام می‌دهد.
       */
      const {error:profileError}=
        await db
          .from("profiles")
          .update({
            email,
            updated_at:new Date().toISOString()
          })
          .eq("id",session.user.id);

      if(profileError){
        console.warn(
          "[ACCOUNT] EMAIL PROFILE SYNC:",
          profileError
        );
      }

      profile.email=email;

      document.getElementById(
        "accountEmail"
      ).value=email;

      document.getElementById(
        "newEmail"
      ).value="";

      thAccountStatus(
        "درخواست ایمیل ثبت شد. پیام تأیید Treasure Hunter را در ایمیل جدید باز کن و تأییدش کن. 📧"
      );

    }catch(error){

      console.error(
        "[ACCOUNT] EMAIL ERROR:",
        error
      );

      thAccountStatus(
        error.message ||
        "خطا در تغییر ایمیل."
      );
    }
  }


  async function saveAccountPassword(){

    if(!session?.user){
      thAccountStatus(
        "ابتدا وارد حساب شو."
      );
      return;
    }

    const current=
      document.getElementById(
        "accountCurrentPassword"
      )?.value;

    const password=
      document.getElementById(
        "accountNewPassword"
      )?.value;

    const password2=
      document.getElementById(
        "accountNewPassword2"
      )?.value;

    if(!password || password.length<6){
      thAccountStatus(
        "رمز جدید باید حداقل ۶ کاراکتر باشد."
      );
      return;
    }

    if(password!==password2){
      thAccountStatus(
        "تکرار رمز جدید با رمز اصلی یکی نیست."
      );
      return;
    }

    try{

      const alreadyHasPassword=
        hasPasswordIdentity();

      /*
       * اگر حساب قبلاً رمز داشته:
       * رمز قبلی الزامی است.
       *
       * اگر حساب OAuth/Google بوده و رمز نداشته:
       * فقط رمز جدید + تکرار رمز کافی است.
       */
      if(alreadyHasPassword){

        await verifyCurrentPassword(
          current
        );
      }

      const options={
        password
      };

      /*
       * supabase-js فعلی current_password را
       * پشتیبانی می‌کند؛ اگر رمز قبلی داشت،
       * آن را هم به Auth می‌دهیم.
       */
      if(alreadyHasPassword){
        options.current_password=current;
      }

      const {error}=
        await db.auth.updateUser(
          options
        );

      if(error){
        throw error;
      }

      document.getElementById(
        "accountCurrentPassword"
      ).value="";

      document.getElementById(
        "accountNewPassword"
      ).value="";

      document.getElementById(
        "accountNewPassword2"
      ).value="";

      thAccountStatus(
        alreadyHasPassword
          ? "رمز عبور تغییر کرد ✅"
          : "رمز عبور برای حساب اضافه شد ✅"
      );

    }catch(error){

      console.error(
        "[ACCOUNT] PASSWORD ERROR:",
        error
      );

      thAccountStatus(
        error.message ||
        "خطا در تغییر رمز عبور."
      );
    }
  }


  async function renderLeaderboard(metric){

    const box=
      document.getElementById(
        "leaderboard"
      );

    if(!box)return;

    box.innerHTML=
      '<div class="leaderboard-loading">در حال دریافت رتبه‌بندی...</div>';

    const {data,error}=
      await db.rpc(
        "leaderboard_metric",
        {
          p_metric:metric
        }
      );

    if(error){

      console.error(
        "[LEADERBOARD] ERROR:",
        error
      );

      box.innerHTML=
        '<div class="leaderboard-empty">خطا در دریافت رتبه‌بندی.</div>';

      return;
    }

    if(!data?.length){

      box.innerHTML=
        '<div class="leaderboard-empty">هنوز رکوردی برای نمایش وجود ندارد.</div>';

      return;
    }

    const titles={
      total_earned:"پول کلی جمع‌شده",
      coins:"پول فعلی",
      treasures_count:"گنج کلی جمع‌شده"
    };

    box.innerHTML=data.map(row=>{

      const value=
        Number(row.value||0)
          .toLocaleString();

      const suffix=
        metric==="treasures_count"
          ? " گنج"
          : " سکه";

      return `
        <div class="leaderboard-item">
          <div class="rank">
            #${row.rank_no}
          </div>

          <div class="rank-name">
            <b>${escapeHtml(row.username||"شکارچی")}</b>
            <small>
              ${titles[metric]}
            </small>
          </div>

          <div class="rank-coins">
            ${value}${suffix}
          </div>
        </div>
      `;

    }).join("");
  }


  function escapeHtml(value){

    return String(value)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }


  function updateAccountUI(){

    if(!profile)return;

    const username=
      document.getElementById(
        "accountUsername"
      );

    const phone=
      document.getElementById(
        "accountPhone"
      );

    const email=
      document.getElementById(
        "accountEmail"
      );

    if(username)
      username.value=
        profile.username||"";

    if(phone)
      phone.value=
        profile.phone||"شماره ثبت نشده";

    if(email)
      email.value=
        profile.email ||
        session?.user?.email ||
        "ایمیل ثبت نشده";

    const hasPassword=
      hasPasswordIdentity();

    const currentBox=
      document.getElementById(
        "passwordCurrentBox"
      );

    const help=
      document.getElementById(
        "passwordHelp"
      );

    if(currentBox){
      currentBox.classList.toggle(
        "hidden",
        !hasPassword
      );
    }

    if(help){
      help.textContent=
        hasPassword
          ? "برای تغییر رمز، رمز قبلی لازم است."
          : "این حساب هنوز رمز عبور ندارد؛ رمز جدید را دو بار وارد کن تا فعال شود.";
    }

    const usernameSecurity=
      document.getElementById(
        "usernamePasswordBox"
      );

    if(usernameSecurity){
      usernameSecurity.classList.toggle(
        "hidden",
        !profile.username
      );
    }

    const phoneSecurity=
      document.getElementById(
        "phonePasswordBox"
      );

    if(phoneSecurity){
      phoneSecurity.classList.toggle(
        "hidden",
        !profile.phone
      );
    }

    const emailSecurity=
      document.getElementById(
        "emailPasswordBox"
      );

    if(emailSecurity){
      emailSecurity.classList.toggle(
        "hidden",
        !profile.email
      );
    }
  }


  function installAuthHandlers(){

    const loginBtn=
      cloneButton("loginBtn");

    const signupBtn=
      cloneButton("signupBtn");

    if(loginBtn){
      loginBtn.addEventListener(
        "click",
        patchedLogin
      );
    }

    if(signupBtn){
      signupBtn.addEventListener(
        "click",
        patchedSignup
      );
    }

    const saveUsernameBtn=
      document.getElementById(
        "saveUsernameBtn"
      );

    const savePhoneBtn=
      document.getElementById(
        "savePhoneBtn"
      );

    const saveEmailBtn=
      document.getElementById(
        "saveEmailBtn"
      );

    const savePasswordBtn=
      document.getElementById(
        "saveAccountPasswordBtn"
      );

    if(saveUsernameBtn)
      saveUsernameBtn.onclick=
        saveUsername;

    if(savePhoneBtn)
      savePhoneBtn.onclick=
        savePhone;

    if(saveEmailBtn)
      saveEmailBtn.onclick=
        saveEmail;

    if(savePasswordBtn)
      savePasswordBtn.onclick=
        saveAccountPassword;


    document
      .querySelectorAll(
        '[data-ranking]'
      )
      .forEach(button=>{

        button.addEventListener(
          "click",
          ()=>{

            document
              .querySelectorAll(
                ".leaderboard-tab"
              )
              .forEach(x=>
                x.classList.remove("active")
              );

            button.classList.add("active");

            renderLeaderboard(
              button.dataset.ranking
            );
          }
        );
      });


    document
      .querySelectorAll(
        '[data-page="leaderboard"]'
      )
      .forEach(button=>{

        button.addEventListener(
          "click",
          ()=>{

            setTimeout(
              ()=>renderLeaderboard(
                document.querySelector(
                  ".leaderboard-tab.active"
                )?.dataset.ranking ||
                "total_earned"
              ),
              50
            );

          }
        );
      });


    document
      .querySelectorAll(
        '[data-page="account"]'
      )
      .forEach(button=>{

        button.addEventListener(
          "click",
          ()=>{

            setTimeout(
              updateAccountUI,
              50
            );

          }
        );
      });


    updateAccountUI();
  }


  /*
   * اگر updateUI اصلی اجرا شد، Account را هم sync کن.
   */
  const originalUpdateUI=
    window.updateUI;

  window.updateUI=function(){

    if(typeof originalUpdateUI==="function"){
      originalUpdateUI();
    }

    try{
      updateAccountUI();
    }catch(error){
      console.warn(
        "[ACCOUNT] UI SYNC:",
        error
      );
    }
  };


  window.addEventListener(
    "DOMContentLoaded",
    ()=>{

      installAuthHandlers();

      setTimeout(
        updateAccountUI,
        100
      );

      setTimeout(
        ()=>renderLeaderboard(
          "total_earned"
        ),
        300
      );

    },
    {once:true}
  );

})();




/* ============================================================
   TREASURE_HUNTER_AUTH_FINAL_FIX_V2
   ============================================================ */

(function(){

  "use strict";

  function accountStatus(text){
    const x=document.getElementById("accountStatus");
    if(x)x.textContent=text||"";
  }

  function gateStatus(text){
    const x=document.getElementById("usernameGateStatus");
    if(x)x.textContent=text||"";
  }

  function gateValidUsername(value){
    return /^[A-Za-z0-9_]{3,24}$/.test(
      String(value||"").trim()
    );
  }

  function hasPassword(){
    try{
      return !!session?.user?.identities?.some(
        x=>x.provider==="email"
      );
    }catch(_){
      return true;
    }
  }

  function normalizePhoneFinal(value){

    let p=String(value||"")
      .trim()
      .replace(/[\s()\-]/g,"");

    if(!p)return null;

    if(/^09\d{9}$/.test(p))
      return "+98"+p.slice(1);

    if(/^9\d{9}$/.test(p))
      return "+98"+p;

    if(/^00\d+$/.test(p))
      return "+"+p.slice(2);

    return p;
  }

  function validPhoneFinal(value){
    const p=normalizePhoneFinal(value);
    return !!p && /^\+[1-9]\d{7,14}$/.test(p);
  }

  async function verifyPasswordFinal(password){

    if(!password)
      throw new Error(
        "برای این تغییر باید رمز عبور فعلی را وارد کنی."
      );

    if(!session?.user)
      throw new Error(
        "نشست کاربری پیدا نشد."
      );

    let email=session.user.email;

    if(!email){

      const r=await db.auth.getUser();

      if(r.error || !r.data?.user?.email)
        throw new Error(
          "ایمیل Auth حساب پیدا نشد."
        );

      email=r.data.user.email;
    }

    const r=await db.auth.signInWithPassword({
      email,
      password
    });

    if(r.error || !r.data?.session)
      throw new Error(
        "رمز عبور فعلی اشتباه است."
      );

    session=r.data.session;

    return true;
  }

  /* ==========================================================
     GOOGLE / OAUTH USERNAME GATE
     ========================================================== */

  async function ensureUsername(){

    if(!session?.user)
      return false;

    if(!profile)
      await loadProfile();

    const username=
      String(profile?.username||"").trim();

    if(gateValidUsername(username))
      return true;

    const gate=document.getElementById("usernameGate");
    const input=document.getElementById("usernameGateInput");

    if(!gate)
      return false;

    document
      .querySelectorAll(".page")
      .forEach(x=>x.classList.remove("active"));

    gate.classList.remove("hidden");

    if(input){
      input.value="";
      setTimeout(()=>input.focus(),100);
    }

    return false;
  }

  async function finishUsername(){

    if(!session?.user)
      return;

    const input=document.getElementById(
      "usernameGateInput"
    );

    const username=
      String(input?.value||"").trim();

    if(!gateValidUsername(username)){
      gateStatus(
        "یوزرنیم باید ۳ تا ۲۴ کاراکتر و فقط شامل حروف انگلیسی، عدد یا _ باشد."
      );
      return;
    }

    const button=document.getElementById(
      "usernameGateBtn"
    );

    if(button){
      button.disabled=true;
      button.textContent="در حال ذخیره...";
    }

    try{

      const {error}=await db
        .from("profiles")
        .update({
          username,
          updated_at:new Date().toISOString()
        })
        .eq("id",session.user.id);

      if(error){

        if(error.code==="23505"){
          throw new Error(
            "این یوزرنیم قبلاً استفاده شده."
          );
        }

        throw error;
      }

      profile.username=username;

      if(typeof updateUI==="function")
        updateUI();

      const gate=document.getElementById(
        "usernameGate"
      );

      if(gate)
        gate.classList.add("hidden");

      setPage("dashboard");

      toast("یوزرنیم ثبت شد؛ خوش اومدی 🚀");

    }catch(error){

      console.error(
        "[USERNAME GATE]",
        error
      );

      gateStatus(
        error.message ||
        "ذخیره یوزرنیم ناموفق بود."
      );

    }finally{

      if(button){
        button.disabled=false;
        button.textContent=
          "ادامه و ورود به Treasure Hunter 🚀";
      }
    }
  }

  /* ==========================================================
     DYNAMIC ACCOUNT OPTIONS
     ========================================================== */

  function renderAccountOptions(){

    const box=document.getElementById(
      "accountOptions"
    );

    if(!box || !profile)
      return;

    const hasUsername=
      !!String(profile.username||"").trim();

    const hasPhone=
      !!String(profile.phone||"").trim();

    const hasEmail=
      !!String(profile.email||"").trim() &&
      !String(profile.email).includes(
        "@username.treasure-hunter.invalid"
      );

    const passwordExists=hasPassword();

    box.innerHTML=`

      <button
        class="account-option"
        data-account-action="username">

        <span>👤</span>

        <div>
          <b>
            ${hasUsername
              ?"تغییر یوزرنیم"
              :"افزودن یوزرنیم"}
          </b>

          <small>
            ${hasUsername
              ?escapeHtmlFinal(profile.username)
              :"برای ورود و شناسایی حساب"}
          </small>
        </div>

        <strong>›</strong>
      </button>


      <button
        class="account-option"
        data-account-action="phone">

        <span>📱</span>

        <div>
          <b>
            ${hasPhone
              ?"تغییر شماره موبایل"
              :"افزودن شماره موبایل"}
          </b>

          <small>
            ${hasPhone
              ?escapeHtmlFinal(profile.phone)
              :"برای ورود با شماره"}
          </small>
        </div>

        <strong>›</strong>
      </button>


      <button
        class="account-option"
        data-account-action="email">

        <span>📧</span>

        <div>
          <b>
            ${hasEmail
              ?"تغییر ایمیل"
              :"افزودن ایمیل"}
          </b>

          <small>
            ${hasEmail
              ?escapeHtmlFinal(profile.email)
              :"برای بازیابی و تأیید حساب"}
          </small>
        </div>

        <strong>›</strong>
      </button>


      <button
        class="account-option"
        data-account-action="password">

        <span>🔐</span>

        <div>
          <b>
            ${passwordExists
              ?"تغییر رمز عبور"
              :"افزودن رمز عبور"}
          </b>

          <small>
            ${passwordExists
              ?"برای تغییر، رمز فعلی لازم است"
              :"این حساب هنوز رمز ندارد"}
          </small>
        </div>

        <strong>›</strong>
      </button>
    `;

    box
      .querySelectorAll("[data-account-action]")
      .forEach(btn=>{

        btn.onclick=()=>{
          openAccountAction(
            btn.dataset.accountAction
          );
        };
      });
  }

  function escapeHtmlFinal(value){

    return String(value||"")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function closeAccountAction(){

    const box=document.getElementById(
      "accountActionBox"
    );

    if(box){
      box.classList.add("hidden");
      box.innerHTML="";
    }

    accountStatus("");
  }

  function openAccountAction(type){

    const box=document.getElementById(
      "accountActionBox"
    );

    if(!box)return;

    const hasUsername=
      !!String(profile?.username||"").trim();

    const hasPhone=
      !!String(profile?.phone||"").trim();

    const hasEmail=
      !!String(profile?.email||"").trim() &&
      !String(profile?.email).includes(
        "@username.treasure-hunter.invalid"
      );

    const passwordExists=hasPassword();

    let html="";

    if(type==="username"){

      html=`
        <h3>
          ${hasUsername
            ?"👤 تغییر یوزرنیم"
            :"👤 افزودن یوزرنیم"}
        </h3>

        <input
          id="accountActionUsername"
          maxlength="24"
          placeholder="یوزرنیم جدید">

        ${
          hasUsername
          ?`
            <input
              id="accountActionPassword"
              type="password"
              placeholder="رمز عبور فعلی">
          `
          :""
        }

        <button
          id="accountActionSave"
          class="primary">
          ذخیره یوزرنیم
        </button>

        <button
          id="accountActionCancel"
          class="text-btn">
          انصراف
        </button>
      `;

    }else if(type==="phone"){

      html=`
        <h3>
          ${hasPhone
            ?"📱 تغییر شماره موبایل"
            :"📱 افزودن شماره موبایل"}
        </h3>

        <input
          id="accountActionPhone"
          type="tel"
          inputmode="tel"
          placeholder="09123456789">

        ${
          hasPhone
          ?`
            <input
              id="accountActionPassword"
              type="password"
              placeholder="رمز عبور فعلی">
          `
          :""
        }

        <button
          id="accountActionSave"
          class="primary">
          ${hasPhone
            ?"تغییر شماره"
            :"افزودن شماره"}
        </button>

        <button
          id="accountActionCancel"
          class="text-btn">
          انصراف
        </button>

        <small>
          ${hasPhone
            ?"برای تغییر شماره، رمز فعلی لازم است."
            :"برای افزودن شماره، رمز لازم نیست."}
        </small>
      `;

    }else if(type==="email"){

      html=`
        <h3>
          ${hasEmail
            ?"📧 تغییر ایمیل"
            :"📧 افزودن ایمیل"}
        </h3>

        <input
          id="accountActionEmail"
          type="email"
          placeholder="example@gmail.com">

        ${
          hasEmail
          ?`
            <input
              id="accountActionPassword"
              type="password"
              placeholder="رمز عبور فعلی">
          `
          :""
        }

        <button
          id="accountActionSave"
          class="primary">
          ${hasEmail
            ?"تغییر ایمیل"
            :"افزودن ایمیل"}
        </button>

        <button
          id="accountActionCancel"
          class="text-btn">
          انصراف
        </button>

        <small>
          ${hasEmail
            ?"برای تغییر ایمیل، رمز فعلی لازم است؛ سپس ایمیل جدید باید تأیید شود."
            :"برای افزودن ایمیل، رمز لازم نیست؛ ایمیل باید تأیید شود."}
          <br>
          ایمیل تأیید با نام <b>Treasure Hunter</b> ارسال می‌شود.
        </small>
      `;

    }else if(type==="password"){

      html=`
        <h3>
          ${passwordExists
            ?"🔐 تغییر رمز عبور"
            :"🔐 افزودن رمز عبور"}
        </h3>

        ${
          passwordExists
          ?`
            <input
              id="accountActionPassword"
              type="password"
              placeholder="رمز عبور فعلی">
          `
          :""
        }

        <input
          id="accountActionNewPassword"
          type="password"
          placeholder="رمز عبور جدید">

        <input
          id="accountActionNewPassword2"
          type="password"
          placeholder="تکرار رمز عبور جدید">

        <button
          id="accountActionSave"
          class="primary">
          ${passwordExists
            ?"تغییر رمز"
            :"افزودن رمز"}
        </button>

        <button
          id="accountActionCancel"
          class="text-btn">
          انصراف
        </button>

        <small>
          ${
            passwordExists
            ?"برای تغییر رمز، رمز فعلی الزامی است."
            :"این حساب هنوز رمز ندارد؛ فقط رمز جدید و تکرارش لازم است."
          }
        </small>
      `;
    }

    box.innerHTML=html;
    box.classList.remove("hidden");

    const save=box.querySelector(
      "#accountActionSave"
    );

    const cancel=box.querySelector(
      "#accountActionCancel"
    );

    if(cancel)
      cancel.onclick=closeAccountAction;

    if(save)
      save.onclick=async()=>{

        save.disabled=true;

        try{

          if(type==="username"){

            const value=
              box.querySelector(
                "#accountActionUsername"
              ).value.trim();

            if(!gateValidUsername(value))
              throw new Error(
                "یوزرنیم باید ۳ تا ۲۴ کاراکتر و فقط شامل حروف انگلیسی، عدد یا _ باشد."
              );

            if(hasUsername){

              await verifyPasswordFinal(
                box.querySelector(
                  "#accountActionPassword"
                ).value
              );
            }

            const {error}=await db
              .from("profiles")
              .update({
                username:value,
                updated_at:new Date().toISOString()
              })
              .eq("id",session.user.id);

            if(error){

              if(error.code==="23505")
                throw new Error(
                  "این یوزرنیم قبلاً استفاده شده."
                );

              throw error;
            }

            profile.username=value;

            closeAccountAction();
            renderAccountOptions();
            updateUI();

            accountStatus(
              "یوزرنیم با موفقیت ذخیره شد ✅"
            );

          }else if(type==="phone"){

            const raw=
              box.querySelector(
                "#accountActionPhone"
              ).value.trim();

            if(!validPhoneFinal(raw))
              throw new Error(
                "شماره موبایل معتبر نیست."
              );

            if(hasPhone){

              await verifyPasswordFinal(
                box.querySelector(
                  "#accountActionPassword"
                ).value
              );
            }

            const phone=
              normalizePhoneFinal(raw);

            const {error}=await db
              .from("profiles")
              .update({
                phone,
                updated_at:new Date().toISOString()
              })
              .eq("id",session.user.id);

            if(error){

              if(error.code==="23505")
                throw new Error(
                  "این شماره قبلاً به یک حساب دیگر وصل شده."
                );

              throw error;
            }

            profile.phone=phone;

            closeAccountAction();
            renderAccountOptions();

            accountStatus(
              "شماره موبایل ذخیره شد ✅"
            );

          }else if(type==="email"){

            const email=
              box.querySelector(
                "#accountActionEmail"
              ).value.trim().toLowerCase();

            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
              throw new Error(
                "ایمیل معتبر نیست."
              );

            if(hasEmail){

              await verifyPasswordFinal(
                box.querySelector(
                  "#accountActionPassword"
                ).value
              );
            }

            const {error}=await db.auth.updateUser({
              email
            });

            if(error)
              throw error;

            /*
             * عمداً profiles.email را همینجا تغییر نمی‌دهیم.
             * بعد از تأیید ایمیل توسط Auth trigger آن را sync می‌کند.
             */

            closeAccountAction();

            accountStatus(
              "ایمیل تأیید برایت ارسال شد 📧\n"+
              "بعد از تأیید، ایمیل جدید به‌صورت خودکار روی حساب ثبت می‌شود."
            );

          }else if(type==="password"){

            const newPassword=
              box.querySelector(
                "#accountActionNewPassword"
              ).value;

            const newPassword2=
              box.querySelector(
                "#accountActionNewPassword2"
              ).value;

            if(newPassword.length<6)
              throw new Error(
                "رمز جدید باید حداقل ۶ کاراکتر باشد."
              );

            if(newPassword!==newPassword2)
              throw new Error(
                "تکرار رمز عبور یکی نیست."
              );

            if(passwordExists){

              await verifyPasswordFinal(
                box.querySelector(
                  "#accountActionPassword"
                ).value
              );
            }

            const {error}=await db.auth.updateUser({
              password:newPassword
            });

            if(error)
              throw error;

            closeAccountAction();

            accountStatus(
              passwordExists
                ?"رمز عبور تغییر کرد ✅"
                :"رمز عبور به حساب اضافه شد ✅"
            );
          }

          renderAccountOptions();

        }catch(error){

          console.error(
            "[ACCOUNT FINAL FIX]",
            error
          );

          accountStatus(
            error.message ||
            "عملیات ناموفق بود."
          );

        }finally{
          save.disabled=false;
        }
      };
  }

  /* ==========================================================
     SHOW APP MUST REQUIRE USERNAME
     ========================================================== */

  const originalShowApp=window.showApp;

  window.showApp=async function(){

    const ok=await ensureUsername();

    if(!ok)
      return false;

    if(typeof originalShowApp==="function"){
      originalShowApp();
    }else{
      setPage("dashboard");
    }

    return true;
  };

  /* ==========================================================
     AUTH STATE -> USERNAME IS REQUIRED
     ========================================================== */

  if(!document.getElementById("usernameGateBtn")){

    setTimeout(()=>{

      const btn=document.getElementById(
        "usernameGateBtn"
      );

      if(btn)
        btn.onclick=finishUsername;

    },0);
  }

  /* ==========================================================
     ACCOUNT PAGE OPEN
     ========================================================== */

  document.addEventListener(
    "DOMContentLoaded",
    ()=>{

      const gateBtn=document.getElementById(
        "usernameGateBtn"
      );

      if(gateBtn)
        gateBtn.onclick=finishUsername;

      renderAccountOptions();

      document
        .querySelectorAll(
          '[data-page="account"]'
        )
        .forEach(btn=>{
          btn.addEventListener(
            "click",
            ()=>{
              setTimeout(
                renderAccountOptions,
                50
              );
            }
          );
        });

    },
    {once:true}
  );

  /* ==========================================================
     PATCH updateUI
     ========================================================== */

  const oldUpdateUI=window.updateUI;

  window.updateUI=function(){

    if(typeof oldUpdateUI==="function")
      oldUpdateUI();

    try{
      renderAccountOptions();
    }catch(error){
      console.warn(
        "[ACCOUNT OPTIONS]",
        error
      );
    }
  };

})();
