//! Read the HWPX OPF manifest with OpenHWP's XML deserializer.
//! Never round-trip document XML through a partial object model.
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

#[derive(Deserialize)]
struct Package { manifest: Manifest }
#[derive(Deserialize)]
struct Manifest { #[serde(rename = "item", default)] items: Vec<Item> }
#[derive(Deserialize, Serialize)]
struct Item {
    #[serde(rename = "@id")] id: String,
    #[serde(rename = "@href")] href: String,
    #[serde(rename = "@media-type", default)] media_type: String,
}
fn main() {
    let result = (|| -> Result<Vec<Item>, Box<dyn std::error::Error>> {
        let mut xml = String::new();
        io::stdin().take(8 * 1024 * 1024 + 1).read_to_string(&mut xml)?;
        if xml.len() > 8 * 1024 * 1024 { return Err("manifest too large".into()); }
        let package: Package = hwpx::from_str(&xml)?;
        Ok(package.manifest.items)
    })();
    match result {
        Ok(items) => println!("{}", serde_json::to_string(&items).unwrap()),
        Err(error) => { eprintln!("{error}"); std::process::exit(1); }
    }
}
