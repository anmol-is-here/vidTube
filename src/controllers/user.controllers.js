import { asyncHandler } from "../utils/asyncHandler.js"
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"
import { apiResponse } from "../utils/apiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        if(!user) {
            throw new apiError(404, "User not found")
        }
        
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
    
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        return {accessToken, refreshToken}
    } catch (error) {
        throw new apiError(500, "Something went wrong while generating access and refresh tokens")
    }
}

const registerUser = asyncHandler( async(req, res) => {
    const {fullname, email, username, password} = req.body

    // validation 
    if(
        [fullname, email, username, password].some((field) =>
        field?.trim() === "")
    ){
        throw new apiError(400, "All fields are required.")
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })
    if(existedUser) {
        throw new apiError(409, "User with given username or email already exist.")
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path
    console.log(req.files)
    const coverLocalPath = req.files?.coverImage?.[0]?.path
    console.log(coverLocalPath)
    
    if(!avatarLocalPath){
        throw new apiError(400, "Avatar file is missing")
    }
    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // let coverImage = ""
    // if(coverLocalPath){
    //     coverImage = await uploadOnCloudinary(coverLocalPath)
    // }

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        // console.log(avatar)
        console.log(`uploaded avatar ${avatar}`)
    } catch (error) {
        console.log(`Error uploading avatar ${error}`);
        throw new apiError(500, "Failed to upload avatar")
    }

    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath)
        console.log(`uploaded coverImage ${coverImage}`)
    } catch (error) {
        console.log(`Error uploading coverImage ${error}`);
        throw new apiError(500, "Failed to upload coverImage")
    }

    try {
        const user = await User.create({
            fullname,
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            email,
            password,
            username: username.toLowerCase()
        })
    
        const createdUser = await User.findById(user._id).select(
            "-password, -refreshToken"
        )
        console.log(createdUser)
        if(!createdUser){
            throw new apiError(500, "something went wrong while registering user")
        }
    
        return res.status(201).json(
            new apiResponse(200, createdUser, "user registered successfully")
        )
    } catch (error) {
        console.log(`User creation falied`);

        // console.log(avatar)
        if(avatar){
            await deleteFromCloudinary(avatar.public_id)
        }
        if(coverImage){
            await deleteFromCloudinary(coverImage.public_id)
        }
        throw new apiError(500, "something went wrong while registering user and images were deleted")
    }
})

const loginUser = asyncHandler( async (req, res) => {
    // get data from body
    const {email, username, password} = req.body
    // validation
    if(!email){
        throw new apiError(400, "Email is required")
    }
    const user = await User.findOne({
        $or: [{username}, {email}]
    })
    if(!user){
        throw new apiError(404, "User not found")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new apiError(401, "Invalid Credentials")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)
    const loggedInUser = await User.findById(user._id)
        .select("-password refreshToken")
    
    if(!loggedInUser){
        throw new apiError(404, "user details not found.")
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json( new apiResponse(
            200,
            { user: loggedInUser, accessToken, refreshToken},
            "User logged in successfully"
        ))

})

const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {new: true}
    )
    const option = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
    }
    return res
        .status(200)
        .clearCookie("accessToken", option)
        .clearCookie("refreshToken", option)
        .json(
            new apiResponse(200, {}, "user logout successfully")
        )
})

const changeCurrentPassword = asyncHandler( async (req, res) => {
    const {oldPassword, newPassword} = req.body
    const user = await User.findById(req.user?._id)
    const isPasswordValid = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordValid){
        throw new apiError(401, "invalid old password")
    }

    user.password = newPassword
    await user.save( {validateBeforeSave: true})

    return res
        .status(200)
        .json( new apiResponse(200, {}, "password updated successfully"))
})

const getCurrentUser = asyncHandler( async (req, res) => {
    return res
        .status(200)
        .json( new apiResponse(200, req.user, "current user details"))
})

const updateAccountDetails = asyncHandler( async (req, res) => {
    const {fullname, email} = req.body
    if(!fullname || !email){
        throw new apiError(400, "fullname and email are required")
    }
    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                fullname,
                email: email
            }
        },
        {new: true}
    ).select("-password -refreshToken")

    return res
        .status(200)
        .json( new apiResponse(200, user, "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler( async (req, res) => {
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath){
        throw new apiError(400, "file is required")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new apiError(400, "no url is found")
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password -refreshToken")

    return res
        .status(200)
        .json(new apiResponse(200, user, "Avatar updated successfully"))
})

const updateUserCoverImage = asyncHandler( async (req, res) => {
    const coverLocalPath = req.file?.path
    if(!coverLocalPath){
        throw new apiError(401, "file is required")
    }
    const coverImage = await uploadOnCloudinary(coverLocalPath)
    if(!coverImage.url){
        throw new apiError(400, "no url is found")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password refreshToken")

    return res
        .status(200)
        .json(new apiResponse(200, user, "CoverImage updated successfully"))
})

const getUserChannelProfile = asyncHandler( async(req, res) => {
    const {username} = req.params
    if(!username){
        throw new apiError(401, "Username is required")
    }
    const channel = await User.aggregate(
        [
            {
                $match: {
                    username: username?.toLowerCase()
                }
            },
            {
                $lookup: {
                    from: "subscriptions",
                    localField: "_id",
                    foreignField: "channel",
                    as: "subscribers"
                }
            },
            {
                $lookup: {
                    from: "subscriptions",
                    localField: "_id",
                    foreignField: "subscriber",
                    as: "subscribedTo"
                }
            },
            {
                $addFields: {
                    subscribersCount: {
                        $size: "$subscribers"
                    },
                    channelsSubscribedToCount: {
                        $size: "$subscribedTo"
                    },
                    isSubscribed: {
                        $cond: {
                            if: { $in: [req.user?._id, "$subscribers.subscriber"]},
                            then: true,
                            else: false
                        }
                    }
                }
            },
            // Project only the necessary data.
            {
                fullname: 1,
                username: 1,
                avatar: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                coverImage: 1,
                email: 1
            }
        ]
    )
    console.log(channel);
    
    if(channel.length == 0){
        throw new apiError(404, "channel not found")
    }
    return res
        .status(200)
        .json(new apiResponse(200, channel[0], "channel profile fetched successfully"))
})

const getWatchHistory = asyncHandler( async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    if(user.length == 0){
        throw new apiError(404, "no user found")
    }

    return res
        .status(200)
        .json(200, user[0]?.watchHistory, "Watch history fetched successfully")
})
    

const refreshAccessToken = asyncHandler( async(req, res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new apiError(401, "Refresh token is required")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new apiError(401, "invalid refresh token");
        }

        if(incomingRefreshToken !== user?.refreshToken){
            throw new apiError(401, "Invalid refresh token")
        }
        const option = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production"
        }
        const {accessToken, refreshToken: newRefreshToken} = await generateAccessAndRefreshToken(user._id)

        return res
            .status(200)
            .cookie("accessToken", accessToken, option)
            .cookie("refreshToken", newRefreshToken, option)
            .json( new apiResponse(
                200,
                {
                    accessToken,
                    refreshToken: newRefreshToken
                },
                "Access token refreshed successfully"
            ))
    } catch (error) {
        throw new apiError(401, "failed to refresh access token")
    }
})

    
export {
    registerUser,
    loginUser,
    logoutUser,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory,
    refreshAccessToken
}
