-- Copyright 2014-2022 Sandor Balazsi <sandor.balazsi@gmail.com>
-- This is free software, licensed under the Apache License, Version 2.0

local fs = require "nixio.fs"
local nixio = require "nixio"
local util = require "luci.util"
local socket = require "socket"

local tostring, tonumber, table, pairs, type, next = tostring, tonumber, table, pairs, type, next

module "rtorrent.xmlrpc"

local rtorrent_config_file = "/root/.rtorrent.rc"

local function get_scgi_address()
	local address, port = ("\n" .. tostring(fs.readfile(rtorrent_config_file)))
		:match("\n%s*scgi_port%s*=%s*([^:]+):(%d+)")
	if not address or not port then
		return nil, "No scgi port defined in " .. rtorrent_config_file .. " config file"
	end
	return address, port
end

local function map(tbl, func, ...)
	local result = {}
	for key, value in pairs(tbl) do
		local result_value, result_key = func(value, key, tbl, ...)
		result[result_key or key] = result_value
	end
	return result
end

local function escape_xml(str)
	return str:gsub("%p", { ["&"] = "&amp;", ["<"] = "&lt;", [">"] = "&gt;", ["'"] = "&apos;", ['"'] = "&quot;" })
end

local function encode_xmlrpc_param(param, param_type)
	param_type = param_type or type(param)
	if param_type == "string" then return "<string>" .. escape_xml(param) .. "</string>"
	elseif param_type == "boolean" then return "<boolean>" .. (param and "1" or "0") .. "</boolean>"
	elseif param_type == "base64" then return "<base64>" .. nixio.bin.b64encode(param) .. "</base64>"
	elseif param_type == "number" then
		if param % 1 == 0 then return "<int>" .. tostring(param) .. "</int>"
		else return "<double>" .. tostring(param) .. "</double>" end
	elseif param_type == "table" then
		if #param > 0 and next(param, #param) == nil then
			return "<array><data>" .. table.concat(map(param, function(value)
				return "<value>" .. encode_xmlrpc_param(value) .. "</value>" end))
				.. "</data></array>"
		else
			local index = 0
			return "<struct>" .. table.concat(map(param, function(value, key)
				index = index + 1
				return "<member><name>" .. escape_xml(key) .. "</name><value>"
					.. encode_xmlrpc_param(value) .. "</value></member>", index
			end)) .. "</struct>"
		end
	elseif param_type == "function" then
		local enforce_type, enforce_param = param()
		return encode_xmlrpc_param(enforce_param, enforce_type)
	end
end

local function encode_xmlrpc(method, ...)
	return "<?xml version=\"1.0\"?>"
		.. "<methodCall><methodName>" .. method .. "</methodName><params>" .. table.concat(map({ ... },
		function(param) return "<param><value>" .. encode_xmlrpc_param(param) .. "</value></param>" end))
		.. "</params></methodCall>"
end

local function parse_xml(str)
	local stack, pos, tag_start, tag_end, close, tag, empty = { { child = {} } }, 1
	while true do
		tag_start, tag_end, close, tag, empty = str:find("<(%/?)(.-)(%/?)>", pos)
		if not tag_start then break
		elseif tag:sub(1, 5) == "?xml " then
		elseif close == "" then
			local element = { tag = tag, child = {} }
			element.find = function(name)
				for _, child in pairs(element.child) do
					if child.tag == name then return child end
				end
			end
			table.insert(empty == "/" and stack[#stack].child or stack, element)
		else
			local element = table.remove(stack)
			local text = str:sub(pos, tag_start - 1)
			if not text:find("^%s*$") then element.text = text end
			table.insert(stack[#stack].child, element)
		end
		pos = tag_end + 1
	end
	return stack[1].child[1]
end

local function decode_xmlrpc(xml)
	if util.contains({ "methodResponse", "params", "param", "value", "array", "fault" }, xml.tag) then
		return xml.text or decode_xmlrpc(xml.child[1])
	elseif util.contains({ "data", "struct" }, xml.tag) then return map(xml.child, decode_xmlrpc)
	elseif util.contains({ "int", "i4", "i8", "double" }, xml.tag) then return tonumber(xml.text)
	elseif xml.tag == "string" then return xml.text
	elseif xml.tag == "boolean" then return xml.text ~= "0"
	elseif xml.tag == "base64" then return nixio.bin.b64decode(xml.text)
	elseif xml.tag == "member" then return decode_xmlrpc(xml.find("value")), xml.find("name").text
	elseif xml.tag == "nil" then return nil
	else error("Unknown xmlrpc tag: " .. xml.tag) end
end

local function build_net_string(body)
	local null = "\0"
	local content_length = "CONTENT_LENGTH" .. null .. body:len() .. null
	local scgi_enable = "SCGI" .. null .. "1" .. null
	local request_method = "REQUEST_METHOD" .. null .. "POST" .. null
	local server_protocol = "SERVER_PROTOCOL" .. null .. "HTTP/1.1" .. null
	local header = content_length .. scgi_enable .. request_method .. server_protocol
	return header:len() .. ":" .. header .. "," .. body
end

local function receive_xmlrpc_answer(sock)
	local headers = {}
	local line, err = sock:receive()
	if err then return nil, err end
	while line ~= "" do
		local name, value = socket.skip(2, line:find("^(.-):%s*(.*)"))
		if not name or not value then return nil, "Malformed response header: " .. line end
		headers[name:lower()] = value
		line, err = sock:receive()
		if err then return nil, err end
	end
	local body = sock:receive(headers["content-length"])
	local code = socket.skip(2, headers.status:find("^(%d%d%d)"))
	if tonumber(code) ~= 200 then return nil, "Wrong response code: " .. code .. " (" .. body .. ")" end
	return body, code, headers
end

--[[ P U B L I C ]]--
function send_xmlrpc_request(body)
	local address, port = get_scgi_address()
	if not address then return nil, port end
	local sock, err = socket.connect(address, port)
	if not sock then return nil, "Socket connect failed: " .. err end
	sock:send(build_net_string(body))
	return receive_xmlrpc_answer(sock)
end

function rtorrent_call(method, ...)
	return decode_xmlrpc(parse_xml(send_xmlrpc_request(encode_xmlrpc(method, ...))))
end
