/** Build commit (`GIT_SHA`, `dev` locally); busts the persisted query cache on deploy (D56). */
declare const __APP_COMMIT__: string;
/** D354: ISO time the web bundle was built (the image is built right before each deploy). */
declare const __APP_BUILT_AT__: string;
