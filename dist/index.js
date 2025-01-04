"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("./app.js");
const data_routes_js_1 = require("./routes/data.routes.js");
const drift_routes_js_1 = require("./routes/drift.routes.js");
const user_routes_js_1 = require("./routes/user.routes.js");
const buildTransaction_routes_js_1 = require("./routes/buildTransaction.routes.js");
const app = new app_js_1.App([
    new data_routes_js_1.DataRoute(),
    new drift_routes_js_1.DriftRoute(),
    new user_routes_js_1.UserRoute(),
    new buildTransaction_routes_js_1.BuildTransactionRoute(),
]);
app.listen();
//# sourceMappingURL=index.js.map