import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken=async(userId)=>{
	try {
		const user=await User.findById(userId);
		const accessToken = user.generateAccessToken();
		const refreshToken= user.generateRefreshToken();
		user.refreshToken=refreshToken;
		await user.save({validateBeforeSave:false});
		return {refreshToken,accessToken};
	} catch (error) {
		throw new ApiError(500,"Something went wrong whlile generating access and refresh token");
	}
}

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

	const {fullName, email, username,password}= req.body;

	if([fullName, email, username,password].some((field)=> field.trim()==="")){
		throw new ApiError(400,"all fields are required");
	}

	const existedUser=await User.findOne({
		$or:[{username},{email}]
	})
	if(existedUser){
		throw new ApiError(409, "User with email or username already existed")
	}

	const avatarLocalPath= req.files?.avatar[0]?.path;
	// const coverImageLocalPath = req.files?.coverImage[0]?.path;

	let coverImageLocalPath;
	if(req.files&&Array.isArray(req.files.coverImage)&&req.files.coverImage.length>0)
		coverImageLocalPath=await uploadOnCloudinary(coverImageLocalPath);


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
		fullName,
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

const loginUser =asyncHandler(async(req,res,next)=>{
	/*
	1.ask data from the frontend
	2.verify if the enterd data is correct or not (username or email )
	3.generate tokens(access and refresh) for the user if the data enetred is correct
	4.return res(success)//send cookie
	{
	1.req body ->data
	2.username or email
	2.find the user 
	2password check
	3access and refresh token
	4send cookie}
	*/

	const {email,username,password}=req.body;
	if(!(username||email)){
		throw new ApiError(400,"enter required details");
	}
	const user =await User.findOne({
		$or:[{username},{email}]
	})
	if(!user){
		throw new ApiError(404,"User not found!!")
	}
	const isValidPassword =await user.isPasswordCorrect(password);

	if(!isValidPassword){
		throw new ApiError(401, "Invalid user credentials");
	}
	
	const {refreshToken, accessToken} =await generateAccessAndRefreshToken(user._id);

	const loggedinUser = await User.findById(user._id).select("-password -refreshToken");

	const options={
		httpOnly:true,
		secure:true,
	}

	return res
	.status(200)
	.cookie("accessToken",accessToken,options)
	.cookie("refreshToken",refreshToken,options)
	.json(
		new ApiResponse(
			200,
			{
				user:loggedinUser,accessToken,refreshToken,
			},
			"User loggedin successfully"
		)
	)

})

const logoutUser = asyncHandler(async(req,res)=>{
	
	await User.findByIdAndUpdate(
		req.user._id,
		{
			$unset: {
                refreshToken: 1 
            }
		},
		{
			new:true,
		}
	)
	const options={
		httpOnly:true,
		secure:true,
	}

	return res
	.status(200)
	.clearCookie("accessToken",options)
	.clearCookie("refreshToken",options)
	.json(new ApiResponse(200,{},"Logged Out Successfully"))
})


const refreshAccessToken = asyncHandler( async(req,res)=>{
	const incomingRefreshToken=req.cookies.refreshToken|| req.body.refreshToken;
	if(!incomingRefreshToken){
		throw new ApiError(401,"Unauthorized request");
	}

	try {
		const decodedToken=jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET);
	
		const user = await User.findById(decodedToken?._id);
		if(!user){
			throw new ApiError(401, "Invalid refresh token"); 
		}
	
		if(incomingRefreshToken!==user?.refreshToken){
			throw new ApiError(401,"Refresh token is user or expired");
		}
	
		const {newRefreshToken, accessToken} =await generateAccessAndRefreshToken(user._id);
		const options={
			httpOnly:true,
			secure:true
		}
	
		return res
		.status(200)
		.cookie("refreshToken",newRefreshToken,options)
		.cookie("accessToken",accessToken,options)
		.json(
			new ApiResponse(200, {accessToken, refreshToken:newRefreshToken,}, "Access token refresh")
		)
	} catch (error) {
		throw new ApiError(401, error?.message||"Invalid refresh token")
	}

})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
	const {oldPassword, newPassword} =req.body;
	const user = await User.findById(req.user?._id);
	const isPasswordCorrect= await user.isPasswordCorrect(oldPassword);
	if(!isPasswordCorrect){
		throw new ApiError(400, "Invalid old password");
	}
	user.password=newPassword;
	await user.save({validateBeforeSave:false});

	return res
	.status(200)
	.json(
		new ApiResponse(200,{}, "Password changed successfully")
	)
})

const getCurrentUser= asyncHandler(async(req,res)=>{
	return res
	.status(200)
	.json(
		200,req.user, "current user fethed successfully"
	)
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
	const {email,username}=req.body;
	if(!fullName||!email){
		throw new ApiError(400, "All fields are required");
	}

	const user =User.findByIdAndUpdate(
		req.user?._id,
		{
			$set:{
				fullName,
				email
			}
		},
		{
			new:true,
		}
	).select("-password -")

	return res
	.status(200)
	.json(new ApiResponse(200,user,"Account details updated succesfully"))
})

const updateUserAvatar= asyncHandler(async(req,res)=>{
	const avatarLocalPath = req.file?.path
	if(!avatarLocalPath){
		throw new ApiError(400, "Avatar file is missing")
	}
	const avatar = await uploadOnCloudinary(avatarLocalPath)

	if(!avatar.url){
		throw new ApiError(400,"Error while uploading on avatar")
	}
	const user=await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set:{
				avatar:avatar.url
			}
		},
		{
			new:true
		}
	).select("-password")

	return res
	.status(200)
	.json(new ApiResponse(200, user, "Avatar Changed successfully"))
})

const updateUserCoverImage= asyncHandler(async(req,res)=>{
	const coverImageLocalPath = req.file?.path
	if(!coverImageLocalPath){
		throw new ApiError(400, "coverImage file is missing")
	}
	const coverImage = await uploadOnCloudinary(coverImageLocalPath)

	if(!coverImage.url){
		throw new ApiError(400,"Error while uploading on coverImage")
	}
	const user=await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set:{
				coverImage:coverImage.url
			}
		},
		{
			new:true
		}
	).select("-password")

	return res
	.status(200)
	.json(new ApiResponse(200, user, "coverImage Changed successfully"))
})

export {registerUser,
	loginUser,
	 logoutUser , 
	 refreshAccessToken,
	 changeCurrentPassword, 
	 getCurrentUser, 
	 updateAccountDetails,
	 updateUserAvatar,
	 updateUserCoverImage
	};