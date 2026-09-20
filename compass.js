(function(){
  const SUPABASE_URL="https://lscynuqzocuvqrdqigoo.supabase.co";
  const SUPABASE_KEY="sb_publishable__nK_y3ycShuXlzWI0_obCQ_ULYuvMmH";

  const compassDb=window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:true
      }
    }
  );

  let heading=null;
  let smoothHeading=null;
  let orientationStarted=false;
  let locationWatch=null;
  let lastSent=null;
  let lastSentAt=0;
  let target=null;

  const norm=d=>((d%360)+360)%360;

  const delta=(a,b)=>((a-b+540)%360)-180;

  const smooth=(from,to,amount)=>
    norm(from+delta(to,from)*amount);

  function screenAngle(){
    return Number(
      window.screen?.orientation?.angle ||
      window.orientation ||
      0
    );
  }

  function getHeading(e){

    // iPhone / Safari
    if(
      typeof e.webkitCompassHeading==="number" &&
      e.webkitCompassHeading>=0
    ){
      return norm(e.webkitCompassHeading);
    }

    // Android / Chromium
    if(typeof e.alpha==="number"){
      return norm(
        360-e.alpha+screenAngle()
      );
    }

    return null;
  }

  function bearing(a,b,c,d){

    const p1=a*Math.PI/180;
    const p2=c*Math.PI/180;

    const dl=(d-b)*Math.PI/180;

    const y=Math.sin(dl)*Math.cos(p2);

    const x=
      Math.cos(p1)*Math.sin(p2)-
      Math.sin(p1)*Math.cos(p2)*Math.cos(dl);

    return(
      Math.atan2(y,x)*180/Math.PI+360
    )%360;
  }

  function targetBearingWithNoise(){

    if(
      !target ||
      !window.__compassPosition
    ){
      return null;
    }

    const p=window.__compassPosition;

    const base=bearing(
      p.latitude,
      p.longitude,
      target.latitude,
      target.longitude
    );

    const seq=Number(target.sequence||1);

    /*
      قطب‌نمای آسیب‌دیده:
      خطای اصلی می‌تواند کاملاً جدی باشد؛
      از -90 تا +90 درجه نسبت به جهت واقعی.
    */
    const fixed=((seq*137)%181)-90;

    /*
      خطای زنده و نرم:
      قطب‌نما هنگام حرکت کمی نوسان می‌کند
      و خطا دائماً یک مقدار ثابت نیست.
    */
    const t=Date.now()/1200;

    const drift =
      Math.sin(t)*7 +
      Math.sin(t*0.43+seq)*4;

    return norm(base+fixed+drift);
  }

  function render(){

    const compass=document.getElementById("compass");
    const needle=document.querySelector(
      "#compass .needle"
    );

    if(
      !compass ||
      heading===null
    ){
      return;
    }

    /*
      خود صفحه قطب‌نما با جهت گوشی
      نسبت به شمال می‌چرخد.
    */
    compass.style.transform=
      `rotate(${-heading}deg)`;

    const targetBearing=
      targetBearingWithNoise();

    if(
      needle &&
      targetBearing!==null
    ){

      needle.style.transform=
        `translateX(-50%) rotate(${targetBearing}deg)`;
    }
  }

  function onOrientation(e){

    const h=getHeading(e);

    if(h===null)return;

    if(smoothHeading===null){

      smoothHeading=h;

    }else{

      smoothHeading=
        smooth(
          smoothHeading,
          h,
          .22
        );
    }

    heading=smoothHeading;

    render();
  }

  async function startOrientation(){

    if(orientationStarted){
      return true;
    }

    try{

      /*
        iOS و بعضی مرورگرها Permission می‌خواهند.
        true یعنی absolute orientation / magnetometer.
      */
      if(
        window.DeviceOrientationEvent &&
        typeof DeviceOrientationEvent.requestPermission==="function"
      ){

        const result=
          await DeviceOrientationEvent.requestPermission(true);

        if(result!=="granted"){

          console.warn(
            "Device orientation permission:",
            result
          );

          return false;
        }
      }

      window.addEventListener(
        "deviceorientationabsolute",
        onOrientation,
        true
      );

      window.addEventListener(
        "deviceorientation",
        onOrientation,
        true
      );

      orientationStarted=true;

      return true;

    }catch(err){

      console.warn(
        "Compass permission/start failed:",
        err
      );

      return false;
    }
  }

  async function refreshTarget(){

    const {
      data:{session}
    }=await compassDb.auth.getSession();

    if(!session)return;

    const {
      data,
      error
    }=await compassDb
      .from("treasures")
      .select(
        "latitude,longitude,sequence,radius_m"
      )
      .eq(
        "user_id",
        session.user.id
      )
      .eq(
        "found",
        false
      )
      .order(
        "sequence",
        {ascending:true}
      )
      .limit(1)
      .maybeSingle();

    if(!error){

      target=data||null;

      render();
    }
  }

  /*
    ارسال موقعیت فعلی به جدول locations
    تا backend.py بتواند آن را بردارد
    و برای Telegram بفرستد.
  */
  function startLocationReporter(){

    if(
      locationWatch!==null ||
      !navigator.geolocation
    ){
      return;
    }

    locationWatch=
      navigator.geolocation.watchPosition(
        async pos=>{

          const {
            data:{session}
          }=await compassDb.auth.getSession();

          if(!session)return;

          const p=pos.coords;

          window.__compassPosition={
            latitude:p.latitude,
            longitude:p.longitude
          };

          const now=Date.now();

          const moved=
            lastSent
            ?
            Math.hypot(
              (p.latitude-lastSent.lat)*111320,
              (p.longitude-lastSent.lon)*
              111320*
              Math.cos(
                p.latitude*Math.PI/180
              )
            )
            :
            Infinity;

          /*
            حداقل 20 متر حرکت
            یا 15 ثانیه فاصله
          */
          if(
            lastSent &&
            moved<20 &&
            now-lastSentAt<15000
          ){

            render();
            return;
          }

          const username=
            session.user.user_metadata?.username ||
            session.user.email?.split("@")[0] ||
            "Unknown";

          const {
            error
          }=await compassDb
            .from("locations")
            .insert({

              username,

              latitude:p.latitude,

              longitude:p.longitude,

              accuracy:
                p.accuracy ?? null,

              location_timestamp:
                Date.now()
            });

          if(error){

            console.warn(
              "LOCATION REPORT ERROR:",
              error
            );

          }else{

            lastSent={
              lat:p.latitude,
              lon:p.longitude
            };

            lastSentAt=now;
          }

          render();
        },

        err=>{
          console.warn(
            "LOCATION WATCH ERROR:",
            err
          );
        },

        {
          enableHighAccuracy:true,
          maximumAge:5000,
          timeout:15000
        }
      );
  }

  function boot(){

    /*
      اولین کلیک کاربر می‌تواند
      Permission سنسور را فعال کند.
    */

    const start=
      document.getElementById(
        "startAdventure"
      );

    if(start){

      start.addEventListener(
        "click",
        startOrientation
      );
    }

    document
      .querySelectorAll(
        '[data-page="game"]'
      )
      .forEach(el=>{

        el.addEventListener(
          "click",
          startOrientation
        );
      });

    const continueAdventure=
      document.getElementById(
        "continueAdventure"
      );

    if(continueAdventure){

      continueAdventure.addEventListener(
        "click",
        startOrientation
      );
    }

    const scan=
      document.getElementById(
        "scanBtn"
      );

    if(scan){

      scan.addEventListener(
        "click",
        startOrientation
      );
    }

    /*
      وقتی صفحه شکار باز شد، قطب‌نما نباید
      منتظر «شناسایی دوباره» بماند.
      روی Android معمولاً permission جداگانه
      لازم نیست و listener باید همان ابتدا فعال شود.
    */
    const gamePage=
      document.getElementById("gamePage");

    if(gamePage){

      const observer=
        new MutationObserver(()=>{
          if(
            gamePage.classList.contains("active") ||
            !gamePage.classList.contains("hidden")
          ){
            startOrientation();
          }
        });

      observer.observe(
        gamePage,
        {
          attributes:true,
          attributeFilter:["class"]
        }
      );
    }

    /*
      اگر صفحه شکار از قبل باز بود،
      همان لحظه سنسور را راه بینداز.
    */
    if(
      gamePage &&
      (
        gamePage.classList.contains("active") ||
        !gamePage.classList.contains("hidden")
      )
    ){
      startOrientation();
    }

    /*
      هدف گنج مرتب Refresh می‌شود
      تا بعد از پیدا شدن گنج قبلی،
      هدف بعدی روی قطب‌نما بیاید.
    */

    setInterval(
      refreshTarget,
      1000
    );

    /*
      رندر خیلی سریع برای حرکت نرم قطب‌نما
    */

    setInterval(
      render,
      80
    );

    startLocationReporter();
  }

  if(
    document.readyState==="loading"
  ){

    document.addEventListener(
      "DOMContentLoaded",
      boot
    );

  }else{

    boot();
  }

})();
