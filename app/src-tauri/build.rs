fn main() {
    println!("cargo:rerun-if-changed=src/macos/quicklook_thumbnail.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("src/macos/quicklook_thumbnail.m")
            .flag("-fobjc-arc")
            .compile("lian_quicklook_thumbnail");
        println!("cargo:rustc-link-lib=framework=QuickLookThumbnailing");
        println!("cargo:rustc-link-lib=framework=ImageIO");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=Foundation");
    }
    tauri_build::build()
}
