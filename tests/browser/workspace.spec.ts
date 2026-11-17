import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
test("demo workspace navigation and blocked exports",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});
 await page.goto("/");
 await expect(page.getByText("Supabase aún no está configurado.",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Explorar demostración"}).click();
 await expect(page.getByRole("heading",{name:"Tu centro de trabajo"})).toBeVisible();
 await expect(page.getByText("DEMO · DATOS FICTICIOS",{exact:true})).toBeVisible();
 mkdirSync("test-results/previews",{recursive:true});
 await page.screenshot({path:"test-results/previews/01-hoy.png",fullPage:true});
 await page.getByRole("button",{name:"Calendario",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Calendario",exact:true})).toBeVisible();
 const header=page.locator(".panel-title h2");const old=await header.textContent();
 await page.getByRole("button",{name:"Semana siguiente"}).click();
 await expect(header).not.toHaveText(old??"");
 await page.getByRole("button",{name:"Hoy",exact:true}).last().click();
 await expect(header).toHaveText(old??"");
 await page.screenshot({path:"test-results/previews/02-calendario.png",fullPage:true});
 await page.getByRole("button",{name:"Propiedades",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Residencia A"})).toBeVisible();
 await page.screenshot({path:"test-results/previews/03-propiedades.png",fullPage:true});
 await page.getByRole("button",{name:"Excepciones",exact:true}).click();
 await expect(page.getByText("1 alerta(s) de programación externa.",{exact:false})).toBeVisible();
 await page.locator(".post-row").first().click();
 const dialog=page.getByRole("dialog",{name:"Detalle de publicación"});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole("button",{name:"Copiar publicación"})).toBeDisabled();
 await expect(dialog.getByRole("button",{name:"Descargar medios"})).toBeDisabled();
 await page.screenshot({path:"test-results/previews/04-detalle.png",fullPage:true});
 await page.keyboard.press("Escape");
 await expect(dialog).toBeHidden();
 await page.getByRole("button",{name:"Salir de demo"}).click();
 await expect(page.getByRole("button",{name:"Explorar demostración"})).toBeVisible();
 expect(errors).toEqual([]);
});
test("mobile layout does not overflow horizontally",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/");
 await page.getByRole("button",{name:"Explorar demostración"}).click();
 await expect(page.getByRole("heading",{name:"Tu centro de trabajo"})).toBeVisible();
 await page.screenshot({path:"test-results/previews/05-mobile.png",fullPage:true});
 for(const name of ["Hoy","Calendario","Propiedades","Excepciones"]){
  await page.getByRole("navigation").getByRole("button",{name,exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }
});

test("master fact confirmation updates demo and blocks old posts",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Explorar demostración"}).click();
 await page.getByRole("navigation").getByRole("button",{name:"Propiedades",exact:true}).click();
 await page.locator(".property").filter({has:page.getByRole("heading",{name:"Residencia A"})}).getByRole("button",{name:"Abrir ficha"}).click();
 const dialog=page.getByRole("dialog",{name:"Ficha maestra"});
 await expect(dialog.getByRole("button",{name:"Confirmar dato"})).toBeDisabled();
 await dialog.getByLabel("Valor",{exact:true}).fill("123456");
 await dialog.getByLabel("Confirmo que el dato coincide",{exact:false}).check();
 await dialog.getByRole("button",{name:"Confirmar dato"}).click();
 await expect(dialog.getByRole("status")).toContainText("1 pendiente(s) afectada(s); 1 programación(es)");
 await expect(dialog.getByText("123,456 USD",{exact:true})).toBeVisible();
 await expect(dialog.getByText("Revisión 3",{exact:false})).toBeVisible();
 await page.screenshot({path:"test-results/previews/06-ficha-maestra.png",fullPage:true});
 await dialog.getByRole("button",{name:"Cerrar ficha"}).click();
 await page.getByRole("navigation").getByRole("button",{name:"Excepciones",exact:true}).click();
 await expect(page.getByText("2 alerta(s) de programación externa.",{exact:false})).toBeVisible();
 await page.locator(".post-row").first().click();
 await expect(page.getByRole("dialog").getByRole("button",{name:"Copiar publicación"})).toBeDisabled();
});

test("fourteen-day planner preserves existing entries and adds drafts only",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Explorar demostración"}).click();
 await page.getByRole("navigation").getByRole("button",{name:"Calendario",exact:true}).click();
 await page.getByRole("button",{name:"Generar calendario"}).click();
 await expect(page.locator(".planner-days .planner-day")).toHaveCount(14);
 await expect(page.locator(".planner-entry.existing").first()).toBeVisible();
 await expect(page.getByText("Propuesta editorial, no contenido listo.",{exact:false})).toBeVisible();
 await page.screenshot({path:"test-results/previews/07-content-planner.png",fullPage:true});
 await page.getByRole("button",{name:"Incorporar borradores a la demo"}).click();
 await expect(page.getByText("Plan incorporado a la demostración.",{exact:false})).toBeVisible();
 await page.getByRole("button",{name:"Generar calendario"}).click();
 await expect(page.locator(".planner-summary span").first()).toHaveText("0 propuestas nuevas");
});

test("content preview produces differentiated evidence-bound drafts without export",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Explorar demostración"}).click();
 await page.getByRole("navigation").getByRole("button",{name:"Excepciones",exact:true}).click();
 await page.locator(".post-row").first().click();
 const dialog=page.getByRole("dialog",{name:"Detalle de publicación"});
 await dialog.getByRole("button",{name:"Preparar copies"}).click();
 await expect(dialog.getByText("Borradores preparados · No autorizados para publicar.",{exact:false})).toBeVisible();
 await expect(dialog.getByRole("heading",{name:"Facebook copy"})).toBeVisible();
 await expect(dialog.getByRole("heading",{name:"Instagram copy"})).toBeVisible();
 await expect(dialog.locator(".draft-variant").first()).toContainText("4 bedrooms");
 await expect(dialog.locator(".draft-variant").first()).toContainText("2,400 sq. ft.");
 await expect(dialog.getByRole("button",{name:"Copiar publicación"})).toBeDisabled();
 await page.screenshot({path:"test-results/previews/08-content-intelligence.png",fullPage:true});
});

test("editorial regeneration rotates language without changing facts",async({page})=>{
 await page.goto("/");
 await page.getByRole("button",{name:"Explorar demostración"}).click();
 await page.getByRole("navigation").getByRole("button",{name:"Excepciones",exact:true}).click();
 await page.locator(".post-row").first().click();
 const dialog=page.getByRole("dialog",{name:"Detalle de publicación"});
 await dialog.getByRole("button",{name:"Preparar copies"}).click();
 await expect(dialog.locator(".draft-variant").first()).toContainText("4 bedrooms");
 const old=await dialog.locator(".draft-variant").first().textContent();
 await dialog.getByRole("button",{name:"Preparar copies"}).click();
 await expect(dialog.locator(".draft-variant").first()).not.toHaveText(old??"");
 await expect(dialog.locator(".draft-variant").first()).toContainText("4 bedrooms");
 await expect(dialog.getByRole("button",{name:"Copiar publicación"})).toBeDisabled();
});
