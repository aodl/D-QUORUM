use ic_asset_certification::{Asset, AssetConfig, AssetFallbackConfig, AssetRouter};
use ic_http_certification::StatusCode;
pub use ic_http_certification::{HttpRequest, HttpResponse};
use include_dir::{Dir, File, include_dir};
use std::cell::RefCell;

static PUBLIC: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/public");

const SECURITY_HEADERS: [(&str, &str); 7] = [
    (
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' https://icp-api.io http://127.0.0.1:4943 http://localhost:4943; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    ),
    (
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
    ),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
    (
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ),
    ("Cross-Origin-Opener-Policy", "same-origin-allow-popups"),
    ("Cross-Origin-Resource-Policy", "same-origin"),
];

thread_local! {
    static ROUTER: RefCell<AssetRouter<'static>> = RefCell::new(AssetRouter::default());
}

fn headers(cache_control: &str) -> Vec<(String, String)> {
    SECURITY_HEADERS
        .iter()
        .map(|(name, value)| ((*name).into(), (*value).into()))
        .chain(std::iter::once((
            "Cache-Control".into(),
            cache_control.into(),
        )))
        .collect()
}

fn well_known_headers() -> Vec<(String, String)> {
    headers("no-cache, no-store, must-revalidate")
        .into_iter()
        .map(|(name, value)| {
            if name == "Cross-Origin-Resource-Policy" {
                (name, "cross-origin".into())
            } else {
                (name, value)
            }
        })
        .chain([("Access-Control-Allow-Origin".into(), "*".into())])
        .collect()
}

fn embedded_files(dir: &'static Dir<'static>) -> Vec<&'static File<'static>> {
    let mut files: Vec<_> = dir.files().collect();
    for child in dir.dirs() {
        files.extend(embedded_files(child));
    }
    files
}

fn allowed_path(path: &str) -> bool {
    path == "index.html"
        || path == "404.html"
        || path == "asset-manifest.json"
        || path == ".well-known/ii-alternative-origins"
        || path.starts_with("generated/")
}

fn assets() -> Vec<Asset<'static, 'static>> {
    embedded_files(&PUBLIC)
        .into_iter()
        .filter(|file| {
            let path = file.path().to_string_lossy();
            allowed_path(&path)
        })
        .map(|file| Asset::new(file.path().to_string_lossy().into_owned(), file.contents()))
        .collect()
}

fn configs() -> Vec<AssetConfig> {
    let no_cache = headers("no-cache, no-store, must-revalidate");
    let immutable = headers("public, max-age=31536000, immutable");
    vec![
        AssetConfig::File {
            path: "index.html".into(),
            content_type: Some("text/html; charset=utf-8".into()),
            headers: no_cache.clone(),
            fallback_for: vec![],
            aliased_by: vec!["/".into()],
            encodings: vec![],
        },
        AssetConfig::File {
            path: "404.html".into(),
            content_type: Some("text/html; charset=utf-8".into()),
            headers: no_cache.clone(),
            fallback_for: vec![AssetFallbackConfig {
                scope: "/".into(),
                status_code: Some(StatusCode::NOT_FOUND),
            }],
            aliased_by: vec![],
            encodings: vec![],
        },
        AssetConfig::File {
            path: "asset-manifest.json".into(),
            content_type: Some("application/json; charset=utf-8".into()),
            headers: no_cache.clone(),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![],
        },
        AssetConfig::File {
            path: ".well-known/ii-alternative-origins".into(),
            content_type: Some("application/json; charset=utf-8".into()),
            headers: well_known_headers(),
            fallback_for: vec![],
            aliased_by: vec![],
            encodings: vec![],
        },
        AssetConfig::Pattern {
            pattern: "generated/*.js".into(),
            content_type: Some("text/javascript; charset=utf-8".into()),
            headers: immutable.clone(),
            encodings: vec![],
        },
        AssetConfig::Pattern {
            pattern: "generated/*.css".into(),
            content_type: Some("text/css; charset=utf-8".into()),
            headers: immutable,
            encodings: vec![],
        },
    ]
}

pub fn certify_assets() {
    ROUTER.with_borrow_mut(|router| {
        *router = AssetRouter::default();
        router
            .certify_assets(assets(), configs())
            .expect("embedded frontend asset configuration must be valid");
        ic_cdk::api::certified_data_set(router.root_hash());
    });
}

pub fn http_request(request: HttpRequest<'_>) -> HttpResponse<'static> {
    let certificate = ic_cdk::api::data_certificate().unwrap_or_default();
    ROUTER.with_borrow(|router| {
        router
            .serve_asset(&certificate, &request)
            .expect("the certified 404 fallback covers every GET asset path")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_required_assets_are_embedded() {
        let paths: Vec<_> = embedded_files(&PUBLIC)
            .into_iter()
            .map(|file| file.path().to_string_lossy())
            .collect();
        assert!(paths.iter().any(|path| path == "index.html"));
        assert!(paths.iter().any(|path| path == "404.html"));
        assert!(paths.iter().any(|path| path == "asset-manifest.json"));
        assert!(
            paths
                .iter()
                .any(|path| path == ".well-known/ii-alternative-origins")
        );
        assert!(paths.iter().any(|path| path.starts_with("generated/")));
        assert!(allowed_path("asset-manifest.json"));
        assert_eq!(assets().len(), paths.len());
    }

    #[test]
    fn policies_cover_html_well_known_and_hashed_assets() {
        let configs = configs();
        assert_eq!(configs.len(), 6);
        let rendered = format!("{configs:?}");
        for expected in [
            "no-cache",
            "immutable",
            "Content-Security-Policy",
            "X-Content-Type-Options",
            "frame-ancestors 'none'",
            "same-origin-allow-popups",
            "Cross-Origin-Resource-Policy\", \"cross-origin",
            "Access-Control-Allow-Origin\", \"*",
        ] {
            assert!(rendered.contains(expected), "missing {expected}");
        }
    }
}
