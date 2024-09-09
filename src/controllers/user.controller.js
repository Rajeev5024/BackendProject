import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
const registerUser=asyncHandler(async (req,res)=>{
	/*
	1. get details from the frontend.
	2. validation if there is any empty filed or not
	3. check if the user is already exist or not
	4. check avatar and image
	5. upload them to cloudinary, uploaded avatar or not
	6. create user object and make a entry a entry in db
	7. remove password and refresh token from the field of resonse
	8. check for user cration 
	9. return res.
	*/

	const {fullname, email, username,password}= req.body;

	if([fullname, email, username,password].some((field)=> field.trim()==="")){
		throw new ApiError(400,"all fields are required");
	}

	const existedUser=User.findOne({
		$or:[{username},{email}]
	})
	if(existedUser){
		throw new ApiError(409, "User with email or username already existed")
	}

	const avatarLocalPath= req.files?.avatar[0]?.path;
	const coverImageLocalPath = req.files?.coverImage[0]?.path;

	if(!avatarLocalPath){
		throw new ApiError(400,"avatar file is required");
	}

	const avatar=await uploadOnCloudinary(avatarLocalPath);
	const coverImage=await uploadOnCloudinary(coverImageLocalPath);

	if(!avatar){
		throw new ApiError(400,"avatar file is required");
	}

	const user = await User.create({
		username:username.toLowerCase(),
		fullname,
		avatar:avatar.url,
		email,
		coverImage:coverImage?.url||"",
		password,
	})

	const createdUser= await User.findById(user._id)?.select("-password -refreshToken");

	if(!createdUser){
		throw new ApiError(500, "Something went wrong while regestrig the user");
	}

	return res.status(201).json(
		new ApiResponse(200, createdUser, "User registered successfully")
	)
	
})

export {registerUser};