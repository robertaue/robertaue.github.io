// Monte Carlo Simulation of the debt-to-gdp and interest-to-tax ratios
//
// Robert Aue, 25.03.2024
// 
// 
// 
// 

//import {randomNormal} from './RandomDistributions.js';
function randomNormal(mean=0, sd=1) {
    // random normal variables using the Box-Muller transformation
    // see https://s3.amazonaws.com/nrbook.com/book_C210.html
    // and https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform#Polar_form
    // and https://stackoverflow.com/questions/1535631/static-variables-in-javascript

    let fac,rsq,v1,v2;
    
    // Check to see if the counter has been initialized
    // move this outside function lest it performs this Check
    // everytime it is called?
    if ( typeof randomNormal.iset == 'undefined' ) {
        // It has not... perform the initialization
        randomNormal.iset = 0;
    }

    if (randomNormal.iset === 1) {
        randomNormal.iset = 0;
        return mean + sd*randomNormal.gset;
    } else {
        do {
            v1 = 2.0*Math.random() - 1.0;
            v2 = 2.0*Math.random() - 1.0;
            rsq = v1*v1 + v2*v2;
        } while (rsq >= 1.0 || rsq === 0.0)
        fac = Math.sqrt(-2.0*Math.log(rsq)/rsq);
        randomNormal.gset = v1*fac;
        randomNormal.iset = 1;
        return mean + sd*v2*fac;
    }
}

// helper functions for arrays
function maxArray(arr) {
    return arr.reduce(
        (current_max, current_value) => Math.max(current_max, current_value),
        -Infinity
    )
}
function minArray(arr) {
    return arr.reduce(
        (current_min, current_value) => Math.min(current_min, current_value),
        Infinity
    )
}
function meanArray(arr) {
    return arr.reduce(
        (current_sum, current_value) => current_sum + current_value,
        0
    ) / arr.length;
}

function oneSim(b0=28, g_mean=2.8, g_sd=2.2, g_se=0, d=0, 
                x_prob=0.2, x_mean=0.5, x_sd=0.5, K=40,
                i0=1.38, r0=3.0, r_bar=3.0, mat=15, tyr=10.75, 
                TT=30) {
    // Parameter
    // b0       Schuldenquote in t0 in % des BIP
    // g_mean   mittlere NOMINALE Wachstumsrate in % p.a.
    // g_sd     Standardabweichung der Wachstumsrate in % p.a.
    // g_se     Standardfehler der mittleren Wachstumsrate (=Parameterunsicherheit über g_mean)
    // d        reguläre Defizitgrenze in % des BIP (wird annahmegemäß voll ausgeschöpft)
    // x_prob   W'keit für Notkredit [0,1]
    // x_mean   mittlerer Notkredit in % des BIP
    // x_sd     Standardabweichung der Notkredit-Höhe in % des BIP
    // K        Tilgungsdauer Notkredit
    // i0       Durchschnittszins auf bestehenden Schuldenstand in t0
    // r0       Marktzins NOMINAL in t0
    // r_bar    Erwartungswert Marktzins
    // mat      Refinanzierungs-Laufzeit
    // tyr      Zins-Steuer-Quote (annahmegemäß konstant)
    // Tt       Zeithorizont für Simulation

    // Variablen definieren
    var Yt; // nominales BIP
    var lnx_mu; // Hilfsvariablen für logNormalVert
    var lnx_sd;
    var xt; // Notkredit als Anteil des BIP]
    var Xt; // Notkredite als numéraire
    var Xt_cum; // kumulierte Notkredite in numéraire
    var Xt_cum_arr = Array(TT); // Sammler
    var Tilgung_t; // Notkredit-Tilgung in t
    var Bt; // nominaler Schuldenstand
    var bt = Array(TT); // Schuldenquote in % des BIP
    var itr = Array(TT); // Zins-Steuer-Quote in %
    var rt; // Marktzins in %
    var it; // Durchschnittszins in %
    const a1 = 0.9483; // parameter für AR(1) Prozess des Marktzinses
    const a0 = r_bar * (1-a1); // parameter für AR(1) Prozess
    const eps_sd = 0.71888; // S.D. des Fehlerterms im AR(1) Modell des Marktzinses

    // transform some percentages to fractions
    b0 = b0 / 100;
    g_mean = g_mean / 100;
    g_sd = g_sd / 100;
    g_se = g_se / 100;
    d = d / 100;
    x_mean = x_mean / 100;
    x_sd = x_sd / 100;

    // initialize some time-dependent variables
    Yt = 100;
    xt = 0;
    Xt_cum = 0; // man könnte hier auch den existierenden Notkredit mit einbeziehen
    Bt = b0 * Yt;
    rt = r0;
    it = i0;
    

    // if g_se>0, draw mean growth rate to account for parameter uncertainty
    if (g_se > 0) {
        g_mean = randomNormal(g_mean, g_se);
    }

    // choose parameters of the Log-Normal distribution für die Notkredite
    if (x_mean>0) {
        // see https://en.wikipedia.org/wiki/Log-normal_distribution
        lnx_mu = Math.log( x_mean**2 / Math.sqrt( x_mean**2 + x_sd**2 ) );
        lnx_sd = Math.sqrt( Math.log( 1 + x_sd**2/x_mean**2 ) );
        //console.log(`lnx_mu = ${lnx_mu}`);
        //console.log(`lnx_sd = ${lnx_sd}`);
    }
    //console.log(`Y0 = ${Yt}`);
    //console.log(`g_mean = ${g_mean}, g_sd = ${g_sd}`);
    
    // simulate through time - time index starts at 0 here so actual time is t+1
    for (let t = 0; t < TT; t++) {
                
        // nominales BIP
        Yt *= (1 + randomNormal(g_mean, g_sd));
        //console.log(`g${t} = ${gt}, Y${t} = ${Yt}`);

        
        
        // Zins-Steuer-Quote
        
        // da Durchschnittszins sich auf Bt-1 bezieht, berechne Zins-Steuer-Quote
        // zuerst, bevor, Bt und it aktualisiert werden
        itr[t] = Bt*it / (Yt*tyr) * 100; // = Bt * it / 100 / (Yt*tyr/100) * 100
        
        // sehr einfaches Modell für Markt- und Durchschnittszins (beide in %, d.h. 3.0%)
        rt = a0 + a1*rt + randomNormal(0, eps_sd);
        it = (1*rt + (mat-1)*it)/mat;

        
        
        // Schuldenquote
        
        // Notkredit
        xt = (x_mean>0 && Math.random()<=x_prob) ? Math.exp(randomNormal(lnx_mu, lnx_sd)) : 0.0;
        Xt = xt*Yt;

        // Notkredit-Tilgungen (uniform über einen Zeitraum von K Jahren)
        Tilgung_t = (Xt_cum - ((t>=K) ? Xt_cum_arr[t-K] : 0))/K

        // Notkredit-Buchhaltung
        Xt_cum += Xt;
        Xt_cum_arr[t] = Xt_cum;

        // Bewegungsgeleichung nominaler Schuldenstand mit NK und Tilgung
        Bt += d*Yt + Xt - Tilgung_t;
        bt[t] = Bt / Yt * 100;
    }

    // return both results as an object
    return {
        Schuldenquote: bt,
        ZinsSteuerQuote: itr
    }
}
// oneSim(25.6, 2.8, 2.2, 0.4, 0.0, 1, 0, 0.5, 1, 1.38, 2.48, 0.0, 15, 10.75,50).Schuldenquote
//

function MCsim(b0=28, g_mean=2.8, g_sd=2.2, g_se=0, d=0, 
               x_prob=0.2, x_mean=0.5, x_sd=0.5, K=40,
               i0=1.38, r0=3.0, r_bar=3.0, mat=15, tyr=10.75, 
               TT=30, Nsim=499) {

    // initialize result arrays
    var b_sim = Array(Nsim);
    var itr_sim = Array(Nsim);
    var b_ti = Array(Nsim);
    var itr_ti = Array(Nsim);
    var bt_stats = {
        time: Array(TT),
        median: Array(TT),
        min: Array(TT),
        max: Array(TT),
        p05: Array(TT),
        p95: Array(TT),
        sample: Array(TT),
    };
    var itr_stats = {
        time: Array(TT),
        median: Array(TT),
        min: Array(TT),
        max: Array(TT),
        p05: Array(TT),
        p95: Array(TT),
        sample: Array(TT),
    };
    var res;
    
    // loop through simulation rounds
    for (let i=0; i<Nsim; i++) {
        //console.log(`### simulation round ${i} ###`);
        res = oneSim(b0, g_mean, g_sd, g_se, d, 
                     x_prob, x_mean, x_sd, K,
                     i0, r0, r_bar, mat, tyr, 
                     TT);
        b_sim[i] = res.Schuldenquote.map((x) => x); // properly copying the array by value
        itr_sim[i] = res.ZinsSteuerQuote.map((x) => x);
        //console.log(`b_sim[${i}].length = ${b_sim[i].length}`);
        //console.log(`b_sim[${i}][0] = ${b_sim[i][0]}`);
    }

    // some helper indices so we don't have to sort three times
    const idx_median = Math.floor(Nsim/2); // don't bother with even/uneven, shouldn't matter at all
    const idx_p05 = Math.floor(Nsim*0.05);
    const idx_p95 = Math.ceil(Nsim*0.95);

    // compute results for each time period across simulations
    for (let t=0; t<TT; t++) {
        //console.log(`### compute stats for time period ${t} ###`)
        bt_stats.time[t] = t+1; // indices start at 0, but first element is already simulated
        itr_stats.time[t] = t+1;

        // fetch simulation results for time period t
        for (let i=0; i<Nsim; i++) { 
            //console.log(`### fetch simulation result for round ${i} in period ${t} ###`)
            b_ti[i] = b_sim[i][t];
            itr_ti[i] = itr_sim[i][t];
        }

        // ... and compute stats
        
        bt_stats.min[t] = minArray(b_ti);
        bt_stats.max[t] = maxArray(b_ti);
        bt_stats.sample[t] = b_ti[0]; // return first simulation as illustrative sample
        b_ti.sort(function(a, b) { return a-b}); // sort is lexicographic, not numeric by default!!!
        bt_stats.p05[t] = b_ti[idx_p05];
        bt_stats.median[t] = b_ti[idx_median];
        bt_stats.p95[t] = b_ti[idx_p95];

        itr_stats.min[t] = minArray(itr_ti);
        itr_stats.max[t] = maxArray(itr_ti);
        itr_stats.sample[t] = itr_ti[0]; // return first simulation as illustrative sample
        itr_ti.sort(function(a, b) { return a-b}); // sort is lexicographic, not numeric by default!!!
        itr_stats.p05[t] = itr_ti[idx_p05];
        itr_stats.median[t] = itr_ti[idx_median];
        itr_stats.p95[t] = itr_ti[idx_p95];
    }

    return {
        Schuldenquote: bt_stats,
        ZinsSteuerQuote: itr_stats
    };
}

function longRunSS(g_mean = 2.8, deficit = 0, x_prob = 0.2, x_mean = 1.0, K = 40) {
    // berechne den long run steady state
    var g = g_mean/100;
    var d = deficit / 100;
    var x = x_mean/100;

    return (1+g)/g * ( d + x_prob*x * ( 1 - (1 - (1+g)**(-K))/(g*K)) ) * 100
}



// einige Tests
function testResult() {
    var oneResult = oneSim(28, 2.8, 2.2, 0, 0.15, 
                           0.2, 0.5, 0.5, 40,
                           1.38, 3.0, 3.0, 15, 10.75, 
                           10)
    var lrss = longRunSS(2.8, .15, .2, 1.0, 40)

    console.log(`Long run steady state: ${lrss}`);
    console.log(`Schuldenquote: ${oneResult.Schuldenquote}`);
    console.log(`Zins-Steuer-Quote: ${oneResult.ZinsSteuerQuote}`);

    return {
        oneMSsim: oneResult,
        lrss: lrss
    }
}
    
//export {oneSim, longRunSS};
//export default testResult;
