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
