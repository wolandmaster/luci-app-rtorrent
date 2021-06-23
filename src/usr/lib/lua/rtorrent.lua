-- Copyright 2014-2021 Sandor Balazsi <sandor.balazsi@gmail.com>
-- Licensed to the public under the GNU General Public License.

local ipairs, string, tostring, tonumber, table = ipairs, string, tostring, tonumber, table
local assert, type, unpack = assert, type, unpack

local nixio = require "nixio"
local socket = require "socket"
local xmlrpc = require "xmlrpc"
local scgi = require "xmlrpc.scgi"

local SCGI_ADDRESS = "localhost"
local SCGI_PORT = 5000

module "rtorrent"

function format(results, commands)
	local formatted_results = {}
	for _, result in ipairs(results) do
		local formatted = {}
		for i, value in ipairs(result) do
			formatted[commands[i]:gsub("[%.=,]", "_")] = value
		end
		table.insert(formatted_results, formatted)
	end
	return formatted_results
end

function call(method, ...)
	local ok, res = scgi.call(SCGI_ADDRESS, SCGI_PORT, method, ...)
	if not ok and res == "socket connect failed" then
		assert(ok, "\n\nFailed to connect to rtorrent: rpc port not reachable!\n"
			.. "Possible reasons:\n"
			.. "- not the rpc version of rtorrent is installed\n"
			.. "- scgi port is not defined in .rtorrent.rc (scgi_port = 127.0.0.1:5000)\n"
			.. "- rtorrent is not running (ps | grep [r]torrent)\n")
	end
	assert(ok, string.format("XML-RPC call failed on client: %s", tostring(res)))
	return res
end

function multicall(method_type, hash, filter, ...)
	local commands = {}
	for i, command in ipairs({...}) do
		if not command:match("=") then command = command .. "=" end
		commands[i] = method_type .. command
	end
	local method = (method_type == "d.") and "multicall2" or "multicall"
	return format(call(method_type .. method, hash, filter, unpack(commands)), {...})
end

function batchcall(method_type, hash, ...)
	local methods = {}
	for i, command in ipairs({...}) do
		local params = { hash }
		if command:match("=") then
			for arg in command:gsub(".*=", ""):gmatch("[^,]+") do
				table.insert(params, arg)
			end
		end
		table.insert(methods, {
			methodName = method_type .. command:gsub("=.*", ""),
			params = xmlrpc.newTypedValue(params, "array")
		})
	end
	local results = {}
	for i, result in ipairs(call("system.multicall", xmlrpc.newTypedValue(methods, "array"))) do
		results[({...})[i]:gsub("[%.=,]", "_")] = (#result == 1) and result[1] or result
	end
	return results
end
