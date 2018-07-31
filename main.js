require("dotenv").config();
const _ = require("lodash");
const Promise = require("bluebird");
const ResinSDK = require("resin-sdk");
const readline = require("readline");

const main = async function() {
  const resin = ResinSDK({
    apiUrl: process.env.RESIN_API_URl || "https://api.resin.io"
  });
  await resin.auth.loginWithToken(process.env.RESIN_API_TOKEN);

  const supervisors = await resin.pine.get({
    resource: "supervisor_release",
    options: { select: ["id", "supervisor_version"] }
  });
  const logstream_supervisors = _.filter(supervisors, s =>
    s.supervisor_version.endsWith("_logstream")
  );
  const logstream_supervisors_ids = _.map(logstream_supervisors, s => s.id);

  const devices = await resin.pine.get({
    resource: "device",
    options: {
      select: ["uuid"],
      expand: {
        should_be_managed_by__supervisor_release: {
          $select: "id"
        }
      },
      filter: { is_online: true }
    }
  });

  const target_devices = _.filter(
    devices,
    d =>
      d.should_be_managed_by__supervisor_release.length === 1 &&
      logstream_supervisors_ids.indexOf(
        d.should_be_managed_by__supervisor_release[0].id
    ) !== -1
  );
  console.log(`Total devices: ${target_devices.length}`);
  // var some_target_devices = target_devices.slice(0, 1000);

  var results = await Promise.map(
    target_devices,
    async device => {
      var success = false;
      var text = "";
      try {
        var result = await resin.models.device.ping(device.uuid);
        if (result.body === "OK") {
          text = `${device.uuid}: CORRECT-LOOKING`;
          success = true;
        } else {
          text = `${device.uuid}: SUSPECT`;
        }
      } catch {
        text = `${device.uuid}: SUSPECT`;
      }
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(text);
      return { uuid: device.uuid, success: success };
    },
    { concurrency: 50 }
  );

  console.log("\n\nSuspects:");
  _.forEach(results, r => {
    if (!r.success) {
      console.log(`${r.uuid}`);
    }
  });
};

main();
